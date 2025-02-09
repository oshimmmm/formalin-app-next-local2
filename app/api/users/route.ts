// app/api/users/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const { username, password, isAdmin = false } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "username と password は必須です" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        isAdmin,
      },
    });

    return NextResponse.json(
      {
        id: newUser.id,
        username: newUser.username,
        isAdmin: newUser.isAdmin,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    // error が Error型かどうか判定
    console.error("ユーザー作成エラー:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
