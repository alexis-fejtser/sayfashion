import { NextResponse } from "next/server";
import { getEuropostCities, getEuropostPickupPoints } from "@/lib/europost";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const data = params.get("mode") === "cities"
      ? await getEuropostCities()
      : await getEuropostPickupPoints(params.get("city") || undefined);
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } });
  } catch (error) {
    console.error("Europost API error", error);
    return NextResponse.json({ error: "Список отделений Европочты временно недоступен" }, { status: 502 });
  }
}
