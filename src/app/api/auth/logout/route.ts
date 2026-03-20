import { serialize } from "cookie";
import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));

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
