// app/api/register/route.ts
import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";

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

    // User を作成 (本来は bcrypt.hash() するのが望ましい)
    const newUser = await prisma.user.create({
      data: {
        username,
        password,
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
