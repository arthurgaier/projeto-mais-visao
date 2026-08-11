import { NextResponse } from "next/server";
import { getBaseUrl } from "../../../../lib/request-url";
import { SESSION_COOKIE } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = await getBaseUrl();
  const response = NextResponse.redirect(new URL("/login", baseUrl));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
