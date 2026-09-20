import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isAdmin } from "@/lib/auth";
import { deleteProduct, saveProduct } from "@/lib/db";
import type { Product } from "@/lib/types";

function slugify(value: string) { return value.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || randomUUID().slice(0, 8); }

async function persistImage(value: string, id: string) {
  if (!value.startsWith("data:image/")) return value;
  const match = value.match(/^data:image\/(png|jpeg|jpg|webp);base64,([\s\S]+)$/);
  if (!match) throw new Error("Неверный формат изображения");
  const extension = match[1] === "jpeg" ? "jpg" : match[1];
  const directory = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(directory, { recursive: true });
  const fileName = `${id}.${extension}`;
  await fs.writeFile(path.join(directory, fileName), Buffer.from(match[2], "base64"));
  return `/uploads/${fileName}`;
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  try {
    const body = await request.json();
    const id = `${slugify(String(body.title))}-${Date.now().toString(36)}`;
    const image = await persistImage(String(body.image), id);
    const product: Product = {
      id, slug: slugify(String(body.title)), title: String(body.title).trim(), description: String(body.description).trim(), category: String(body.category).trim(),
      price: Number(body.price), sizes: String(body.sizes).split(",").map((v) => v.trim()).filter(Boolean), colors: String(body.colors).split(",").map((v) => v.trim()).filter(Boolean),
      image, published: body.published !== false, createdAt: new Date().toISOString(),
    };
    if (!product.title || !product.description || !product.category || !Number.isFinite(product.price) || product.price <= 0) throw new Error("Проверьте обязательные поля");
    return NextResponse.json(await saveProduct(product));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Ошибка сохранения" }, { status: 400 }); }
}

export async function DELETE(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Не указан товар" }, { status: 400 });
  await deleteProduct(id);
  return NextResponse.json({ ok: true });
}
