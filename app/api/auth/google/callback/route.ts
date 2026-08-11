import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "../../../../../db";
import { users } from "../../../../../db/schema";
import { getBaseUrl } from "../../../../../lib/request-url";
import { exchangeGoogleCode, fetchGoogleUserInfo } from "../../../../../lib/google-auth";
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  isEmailAllowed,
  signSession,
} from "../../../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const baseUrl = await getBaseUrl();
  const loginUrl = new URL("/login", baseUrl);

  const cookieStore = await cookies();
  const savedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;

  if (oauthError || !code || !state || !savedState || state !== savedState) {
    loginUrl.searchParams.set("error", oauthError ?? "invalid_state");
    return NextResponse.redirect(loginUrl);
  }

  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  let tokens;
  try {
    tokens = await exchangeGoogleCode(code, redirectUri);
  } catch {
    loginUrl.searchParams.set("error", "token_exchange_failed");
    return NextResponse.redirect(loginUrl);
  }

  if (!tokens.refresh_token) {
    // Shouldn't happen with prompt=consent, but background sync needs one.
    loginUrl.searchParams.set("error", "missing_refresh_token");
    return NextResponse.redirect(loginUrl);
  }

  const profile = await fetchGoogleUserInfo(tokens.access_token);

  if (!profile.email_verified || !isEmailAllowed(profile.email)) {
    loginUrl.searchParams.set("error", "not_allowed");
    return NextResponse.redirect(loginUrl);
  }

  const db = getDb();
  const accessTokenExpiresAt = Date.now() + tokens.expires_in * 1000;

  const [user] = await db
    .insert(users)
    .values({
      googleSub: profile.sub,
      email: profile.email,
      name: profile.name,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      accessTokenExpiresAt,
    })
    .onConflictDoUpdate({
      target: users.googleSub,
      set: {
        email: profile.email,
        name: profile.name,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
        accessTokenExpiresAt,
      },
    })
    .returning();

  const sessionToken = await signSession({
    id: user.id,
    email: user.email,
    name: user.name,
  });

  const response = NextResponse.redirect(new URL("/", baseUrl));
  response.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}
