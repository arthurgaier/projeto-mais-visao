import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const OAUTH_STATE_COOKIE = "oauth_state";

export type SessionUser = {
  id: number;
  email: string;
  name: string;
};

async function hmacKey() {
  const secret = env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not configured. Set it with `wrangler secret put SESSION_SECRET`.",
    );
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of array) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function signSession(user: SessionUser): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(user)));
  const key = await hmacKey();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return `${payload}.${toBase64Url(signature)}`;
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const key = await hmacKey();
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(signature),
    new TextEncoder().encode(payload),
  );
  if (!valid) return null;

  try {
    return JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as SessionUser;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (user) return user;
  redirect("/login");
}

export function isEmailAllowed(email: string): boolean {
  const allowList = (env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (allowList.length === 0) return false;
  return allowList.includes(email.toLowerCase());
}
