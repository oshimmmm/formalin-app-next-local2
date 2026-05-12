import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";

type SubmitResult =
  | {
      ok: true;
      status: 200;
      body: { success: true; id: number };
    }
  | {
      ok: false;
      status: 400 | 404 | 409;
      body: { success: false; message: string; confirmationRequired?: "expired" };
    };

const INVALID_REQUEST_MESSAGE = "無効なコードです。もう一度読み込んでください。";
const NOT_FOUND_MESSAGE = "ホルマリンが見つかりません。入庫してください。";
const NOT_OUTBOUND_MESSAGE =
  "このホルマリンは出庫済みの中にありません。出庫されていないか、既に提出済みです。";
const RETURN_BY_REQUIRED_MESSAGE =
  "提出元を選択してください（手術室からの返却は提出元の選択が必須です）。";
const EXPIRED_CONFIRMATION_REQUIRED_MESSAGE =
  "このホルマリンは期限切れです。提出しますか？";

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isExpired(expired?: Date | null): boolean {
  if (!expired || Number.isNaN(expired.getTime())) return false;
  const nowJST = new Date(new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
  return expired < nowJST;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const lotNumber = asString(body?.lotNumber);
    const boxNumber = asString(body?.boxNumber);
    const productCode = asString(body?.productCode);
    const key = asString(body?.key);
    const returnBy = typeof body?.returnBy === "string" ? body.returnBy : "";
    const updatedBy = asString(body?.updatedBy) ?? "anonymous";
    const allowExpired = body?.allowExpired === true;

    if (!lotNumber || !boxNumber || !productCode || !key) {
      return NextResponse.json(
        { success: false, message: INVALID_REQUEST_MESSAGE },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx): Promise<SubmitResult> => {
      const existing = await tx.formalin.findUnique({
        where: {
          lot_number_key_box_number_productCode: {
            lot_number: lotNumber,
            key,
            box_number: boxNumber,
            productCode,
          },
        },
        select: {
          id: true,
          key: true,
          status: true,
          place: true,
          expired: true,
        },
      });

      if (!existing) {
        return {
          ok: false,
          status: 404,
          body: { success: false, message: NOT_FOUND_MESSAGE },
        };
      }

      if (existing.status !== "出庫済み") {
        return {
          ok: false,
          status: 409,
          body: { success: false, message: NOT_OUTBOUND_MESSAGE },
        };
      }

      const place = existing.place ?? "";
      const isFromOR = place.startsWith("手術室");
      const hasSelection = returnBy.trim().length > 0;

      if (isFromOR && !hasSelection) {
        return {
          ok: false,
          status: 409,
          body: { success: false, message: RETURN_BY_REQUIRED_MESSAGE },
        };
      }

      if (!isFromOR && hasSelection) {
        return {
          ok: false,
          status: 409,
          body: {
            success: false,
            message: `このホルマリンは手術室ではなく「${place || "不明"}」に出庫されています。提出元は空欄にしてください。`,
          },
        };
      }

      if (isExpired(existing.expired) && !allowExpired) {
        return {
          ok: false,
          status: 409,
          body: {
            success: false,
            message: EXPIRED_CONFIRMATION_REQUIRED_MESSAGE,
            confirmationRequired: "expired",
          },
        };
      }

      const now = new Date();
      const updated = await tx.formalin.updateMany({
        where: {
          id: existing.id,
          status: "出庫済み",
        },
        data: {
          status: "提出済み",
          timestamp: now,
          returnBy,
        },
      });

      if (updated.count === 0) {
        return {
          ok: false,
          status: 409,
          body: { success: false, message: NOT_OUTBOUND_MESSAGE },
        };
      }

      await tx.history.create({
        data: {
          key: existing.key ?? null,
          formalinId: existing.id,
          updated_by: updatedBy,
          updated_at: now,
          old_status: existing.status ?? "",
          new_status: "提出済み",
          old_place: existing.place ?? "",
          new_place: "病理へ提出",
        },
      });

      return {
        ok: true,
        status: 200,
        body: { success: true, id: existing.id },
      };
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error: unknown) {
    console.error("POST /api/formalin/submit error:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "提出処理中に不明なエラーが発生しました。",
      },
      { status: 500 }
    );
  }
}
