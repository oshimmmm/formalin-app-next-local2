// middleware.ts
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

// このmiddlewareを発動させたいパス
export const config = {
  matcher: [
    "/home/:path*",      // /home 以下を保護
    "/inbound/:path*",   // /inbound 以下を保護
    "/outbound/:path*",
    "/admin/:path*",
    // ...など
  ],
};

export async function middleware(req: NextRequest) {
  // NextAuthが生成するJWT(トークン)をチェック
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    // 未ログインの場合
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // ログイン済みならそのまま進む
  return NextResponse.next();
}
