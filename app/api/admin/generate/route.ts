import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { createProductDraftFromPhoto } from "@/lib/ai-product";

export const maxDuration = 120;
export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    const { image, count, prompt } = await request.json();
    if (typeof image !== "string" || !image.startsWith("data:image/") || image.length > 15_000_000) return NextResponse.json({ error: "Нужно изображение до 10 МБ" }, { status: 400 });
    if (prompt !== undefined && (typeof prompt !== "string" || prompt.length > 4_000)) return NextResponse.json({ error: "Промпт должен быть короче 4000 символов" }, { status: 400 });
    const variantCount = Math.min(Math.max(Number(count) || 2, 1), 4);
    return NextResponse.json(await createProductDraftFromPhoto(image, variantCount, String(prompt || "").trim()));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Ошибка OpenRouter" }, { status: 500 }); }
}
