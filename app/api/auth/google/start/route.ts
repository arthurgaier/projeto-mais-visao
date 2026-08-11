import { NextResponse } from "next/server";
import { getBaseUrl } from "../../../../../lib/request-url";
import { buildGoogleAuthUrl } from "../../../../../lib/google-auth";
import { OAUTH_STATE_COOKIE } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = await getBaseUrl();
  const redirectUri = `${baseUrl}/api/auth/google/callback`;
  const state = crypto.randomUUID();

  const response = NextResponse.redirect(buildGoogleAuthUrl(redirectUri, state));
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
