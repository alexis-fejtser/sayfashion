import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { deletePrompt, getPrompts, savePrompt } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import type { AiPrompt } from "@/lib/types";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  return NextResponse.json(await getPrompts());
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    assertSameOrigin(request);
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!name || !text) throw new Error("Укажите название и текст промпта");
    if (name.length > 80) throw new Error("Название должно быть короче 80 символов");
    if (text.length > 4_000) throw new Error("Промпт должен быть короче 4000 символов");
    const prompt: AiPrompt = {
      id: typeof body.id === "string" && body.id.trim() ? body.id.trim() : randomUUID(),
      name,
      text,
      createdAt: typeof body.createdAt === "string" ? body.createdAt : new Date().toISOString(),
    };
    return NextResponse.json(await savePrompt(prompt));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ошибка сохранения" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    assertSameOrigin(request);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new Error("Промпт не выбран");
    await deletePrompt(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ошибка удаления" }, { status: 400 });
  }
}
