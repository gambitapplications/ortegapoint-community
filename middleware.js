import { NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";

const TEAM_DOMAIN = process.env.CF_ACCESS_TEAM_DOMAIN || "";
const AUD = process.env.CF_ACCESS_AUD || "";

const JWKS = TEAM_DOMAIN
  ? createRemoteJWKSet(new URL(`https://${TEAM_DOMAIN}/cdn-cgi/access/certs`))
  : null;

const ISSUER = TEAM_DOMAIN ? `https://${TEAM_DOMAIN}` : "";

// Loopback bypass: requests from 127.0.0.1 are internal monitoring only.
// CF tunnel forwards public traffic here but rewrites the source address,
// so on-origin checks still see real traffic as coming from loopback.
// We rely on the JWT presence as the actual guard.
function isHealthCheck(pathname) {
  return pathname === "/api/health";
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (isHealthCheck(pathname)) {
    return NextResponse.next();
  }

  // Soft-fail if env is missing so we never lock the owner out over a
  // misconfiguration. A warning shows up in the service log.
  if (!TEAM_DOMAIN || !AUD || !JWKS) {
    console.warn("[access] CF_ACCESS_TEAM_DOMAIN/CF_ACCESS_AUD unset; JWT check skipped");
    return NextResponse.next();
  }

  const token =
    request.headers.get("cf-access-jwt-assertion") ||
    request.cookies.get("CF_Authorization")?.value;

  if (!token) {
    return new NextResponse("Access denied (missing CF Access token)", { status: 403 });
  }

  try {
    await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      audience: AUD
    });
    return NextResponse.next();
  } catch (err) {
    console.warn("[access] JWT validation failed:", err?.message || err);
    return new NextResponse("Access denied (invalid CF Access token)", { status: 403 });
  }
}

export const config = {
  // Run on everything except static asset requests that don't need auth state.
  // (CF Access still fronts those at the edge.)
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
