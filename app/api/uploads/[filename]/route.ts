import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    const safeName = path.basename(filename);
    
    const possiblePaths = [
      path.join(process.cwd(), "public", "uploads", safeName),
      path.join(process.cwd(), "uploads", safeName),
    ];

    let fileBuffer: Buffer | null = null;
    for (const filePath of possiblePaths) {
      try {
        fileBuffer = await fs.readFile(/*turbopackIgnore: true*/ filePath);
        break;
      } catch {
        // try next path
      }
    }

    if (!fileBuffer) {
      return new NextResponse("Файл не найден", { status: 404 });
    }

    const ext = path.extname(safeName).toLowerCase();
    const contentType = 
      ext === ".png" ? "image/png" :
      ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
      ext === ".webp" ? "image/webp" : "application/octet-stream";

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Ошибка чтения файла", { status: 500 });
  }
}
