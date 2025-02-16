// app/api/verify-password/route.ts
import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import bcrypt from "bcrypt";

// POST /api/verify-password
// Body: { username, password }
export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return NextResponse.json({
        success: false,
        message: "ユーザーが存在しません。",
      });
    }

    // bcrypt.compare(平文パスワード, DBに保存されているハッシュ)
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json({
        success: false,
        message: "パスワードが間違っています。",
      });
    }

    // 照合成功
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("パスワード検証エラー:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
