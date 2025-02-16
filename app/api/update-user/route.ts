// app/api/update-user/route.ts
import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import bcrypt from "bcrypt";

// POST /api/update-user
// Body: { username, newPassword, newIsAdmin }
export async function POST(req: Request) {
  try {
    const { username, newPassword, newIsAdmin } = await req.json();

    // ユーザーが存在するか確認
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return NextResponse.json({ success: false, message: "ユーザーが存在しません" });
    }

    // 新しいパスワードが指定されているならハッシュ化
    let hashedPassword: string | undefined = undefined;
    if (newPassword) {
      // パスワードをハッシュ化
      hashedPassword = await bcrypt.hash(newPassword, 10);
    }

    // パスワード or isAdmin を更新
    // hashedPassword が undefined の場合は更新しない (COALESCE的な動き)
    await prisma.user.update({
      where: { username },
      data: {
        password: hashedPassword ?? undefined, // hashedPasswordがundefinedなら更新しない
        isAdmin: newIsAdmin ?? undefined,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("ユーザー更新エラー:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
