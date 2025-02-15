// app/api/delete-user/route.ts
import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";

// DELETE /api/delete-user
// Body: { username }
export async function DELETE(req: Request) {
  try {
    const { username } = await req.json();
    if (!username) {
      return NextResponse.json(
        { success: false, message: "ユーザー名が提供されていません。" },
        { status: 400 }
      );
    }

    // ユーザーが存在するか
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return NextResponse.json({ success: false, message: "ユーザーが存在しません。" });
    }

    // ユーザーを削除
    await prisma.user.delete({ where: { username } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("ユーザー削除エラー:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}