// app/api/register/route.ts
import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import bcrypt from "bcrypt";

// POST /api/register
// Body: { username, password, isAdmin }
export async function POST(req: Request) {
  try {
    const { username, password, isAdmin = false } = await req.json();

    // ユーザー重複チェック
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json(
        { success: false, message: "このユーザー名は既に使用されています。" },
        { status: 400 }
      );
    }

    // 1) パスワードをハッシュ化（ソルトラウンドは 10 など適宜）
    const hashedPassword = await bcrypt.hash(password, 10);

    // 2) User を作成 (ハッシュ済みのパスワードを保存)
    const newUser = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        isAdmin,
      },
    });

    return NextResponse.json({ success: true, userId: newUser.id });
  } catch (error: unknown) {
    // error が Error型かどうか判定
    console.error("Register error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
