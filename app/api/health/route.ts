import { NextResponse } from "next/server";
import { checkDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const database = await checkDatabase();
    return NextResponse.json({ ok: true, database, checkedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, database: { ok: false } }, { status: 503 });
  }
}
