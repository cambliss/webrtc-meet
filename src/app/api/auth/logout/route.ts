import { serialize } from "cookie";
import { NextResponse } from "next/server";
import { resolveAppBaseUrl } from "@/src/lib/resolveAppBaseUrl";

export async function POST(req: Request) {
  const loginUrl = new URL("/login", resolveAppBaseUrl(req));

  const response = NextResponse.redirect(loginUrl);

  response.headers.set(
    "Set-Cookie",
    serialize("meeting_token", "", {
      path: "/",
      httpOnly: true,
      expires: new Date(0),
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    }),
  );

  return response;
}
