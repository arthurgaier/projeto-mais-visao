import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../db";
import { users } from "../db/schema";
import { GOOGLE_TOKEN_URL } from "./google-auth";

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Refresh a couple minutes early so a token doesn't expire mid-request.
const EXPIRY_SAFETY_MARGIN_MS = 2 * 60 * 1000;

export type DbUser = typeof users.$inferSelect;

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: number }> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${await response.text()}`);
  }
  const data = (await response.json()) as { access_token: string; expires_in: number };
  return { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
}

// Returns a valid Drive access token for this user, refreshing and
// persisting a new one if the cached one is missing or close to expiry.
export async function getValidAccessToken(user: DbUser): Promise<string> {
  const isFresh =
    user.accessToken != null &&
    user.accessTokenExpiresAt != null &&
    user.accessTokenExpiresAt - EXPIRY_SAFETY_MARGIN_MS > Date.now();
  if (isFresh) return user.accessToken!;

  const { accessToken, expiresAt } = await refreshAccessToken(user.refreshToken);

  const db = getDb();
  await db
    .update(users)
    .set({ accessToken, accessTokenExpiresAt: expiresAt })
    .where(eq(users.id, user.id));

  return accessToken;
}

export type DriveFile = {
  id: string;
  name: string;
  modifiedTime: string;
};

// Lists .docx files directly inside `folderId`, optionally only those
// modified after `modifiedAfterIso` (an ISO 8601 timestamp).
export async function listDriveDocxFiles(
  accessToken: string,
  folderId: string,
  modifiedAfterIso?: string,
): Promise<DriveFile[]> {
  const queryParts = [
    `'${folderId}' in parents`,
    "trashed = false",
    `mimeType = '${DOCX_MIME_TYPE}'`,
  ];
  if (modifiedAfterIso) {
    queryParts.push(`modifiedTime > '${modifiedAfterIso}'`);
  }

  const url = new URL(DRIVE_FILES_URL);
  url.searchParams.set("q", queryParts.join(" and "));
  url.searchParams.set("fields", "files(id,name,modifiedTime)");
  url.searchParams.set("orderBy", "modifiedTime");
  url.searchParams.set("pageSize", "100");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Google Drive list failed: ${await response.text()}`);
  }
  const data = (await response.json()) as { files: DriveFile[] };
  return data.files;
}

export async function downloadDriveFile(
  accessToken: string,
  fileId: string,
): Promise<ArrayBuffer> {
  const response = await fetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Google Drive download failed for ${fileId}: ${await response.text()}`);
  }
  return response.arrayBuffer();
}

export type DriveFolderInfo = {
  id: string;
  name: string;
};

export async function getDriveFolder(
  accessToken: string,
  folderId: string,
): Promise<DriveFolderInfo> {
  const url = new URL(`${DRIVE_FILES_URL}/${folderId}`);
  url.searchParams.set("fields", "id,name,mimeType");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Google Drive folder lookup failed: ${await response.text()}`);
  }
  const data = (await response.json()) as { id: string; name: string; mimeType: string };
  if (data.mimeType !== "application/vnd.google-apps.folder") {
    throw new Error("O link informado não aponta para uma pasta do Google Drive.");
  }
  return { id: data.id, name: data.name };
}

// Accepts either a raw folder ID or a full Drive folder URL/link.
export function parseDriveFolderId(input: string): string | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  return null;
}
