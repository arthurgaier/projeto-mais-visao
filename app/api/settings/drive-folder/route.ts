import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, getUserById } from "../../../../db";
import { driveSettings } from "../../../../db/schema";
import { getBaseUrl } from "../../../../lib/request-url";
import { requireUser } from "../../../../lib/session";
import { getValidAccessToken, getDriveFolder, parseDriveFolderId } from "../../../../lib/google-drive";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sessionUser = await requireUser();
  const baseUrl = await getBaseUrl();
  const settingsUrl = new URL("/settings", baseUrl);

  const formData = await request.formData();
  const folderLink = String(formData.get("folderLink") ?? "");
  const folderId = parseDriveFolderId(folderLink);

  if (!folderId) {
    settingsUrl.searchParams.set("error", "invalid_folder");
    return NextResponse.redirect(settingsUrl, { status: 303 });
  }

  const user = await getUserById(sessionUser.id);
  if (!user) {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }

  try {
    const accessToken = await getValidAccessToken(user);
    const folder = await getDriveFolder(accessToken, folderId);

    const db = getDb();
    const [existing] = await db
      .select()
      .from(driveSettings)
      .where(eq(driveSettings.userId, user.id))
      .limit(1);

    if (existing) {
      // Reset the sync watermark: a new folder means everything in it is "new".
      await db
        .update(driveSettings)
        .set({ folderId: folder.id, folderName: folder.name, lastSyncedAt: null })
        .where(eq(driveSettings.id, existing.id));
    } else {
      await db.insert(driveSettings).values({
        userId: user.id,
        folderId: folder.id,
        folderName: folder.name,
      });
    }

    settingsUrl.searchParams.set("success", "1");
  } catch (error) {
    settingsUrl.searchParams.set(
      "error",
      error instanceof Error ? error.message : "unknown_error",
    );
  }

  return NextResponse.redirect(settingsUrl, { status: 303 });
}
