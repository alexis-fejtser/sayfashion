import { z } from "zod";

const rawOfficeSchema = z.object({
  WarehouseId: z.coerce.string(),
  WarehouseName: z.string(),
  Longitude: z.coerce.string().optional().default(""),
  Latitude: z.coerce.string().optional().default(""),
  Address1Id: z.coerce.string().optional().default(""),
  Info1: z.string().optional().default(""),
  Address7Name: z.string().optional().default(""),
  Address6Name: z.string().optional().default(""),
  Address5Name: z.string().optional().default(""),
  WarehouseWeightLimit: z.coerce.string().optional().default(""),
});

const apiResponseSchema = z.object({ Table: z.array(rawOfficeSchema) });

export type EuropostOffice = {
  id: string;
  addressId: string;
  name: string;
  city: string;
  region: string;
  info: string;
  latitude: number | null;
  longitude: number | null;
  weightLimitKg: number | null;
};

let officeCache: { expiresAt: number; offices: EuropostOffice[] } | null = null;
let pendingRequest: Promise<EuropostOffice[]> | null = null;

function apiConfig() {
  return {
    url: process.env.EUROPOST_API_URL || "https://evropochta.by/rest/Json",
    serviceNumber: process.env.EUROPOST_SERVICE_NUMBER || "E811AE79-DFDE-4F85-8715-DD3A8308707E",
  };
}

function numberOrNull(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function requestOffices(): Promise<EuropostOffice[]> {
  const { url, serviceNumber } = apiConfig();
  const endpoint = new URL(url);
  endpoint.searchParams.set("What", "Postal.OfficesOut");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/plain" },
      body: JSON.stringify({
        CRC: "",
        Packet: { MethodName: "Postal.OfficesOut", JWT: null, ServiceNumber: serviceNumber, Data: {} },
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Европочта API: HTTP ${response.status}`);
    const parsed = apiResponseSchema.parse(await response.json());
    return parsed.Table.map((office) => ({
      id: office.WarehouseId,
      addressId: office.Address1Id,
      name: office.WarehouseName.trim(),
      city: (office.Address5Name || office.Address6Name).trim(),
      region: office.Address7Name.trim(),
      info: office.Info1.trim(),
      latitude: numberOrNull(office.Latitude),
      longitude: numberOrNull(office.Longitude),
      weightLimitKg: numberOrNull(office.WarehouseWeightLimit),
    })).filter((office) => office.id && office.name && office.city);
  } finally {
    clearTimeout(timeout);
  }
}

export async function getEuropostOffices(): Promise<EuropostOffice[]> {
  if (officeCache && officeCache.expiresAt > Date.now()) return officeCache.offices;
  pendingRequest ??= requestOffices().then((offices) => {
    officeCache = { offices, expiresAt: Date.now() + 15 * 60_000 };
    return offices;
  }).finally(() => { pendingRequest = null; });
  return pendingRequest;
}

export async function getEuropostCities() {
  const offices = await getEuropostOffices();
  return Array.from(new Set(offices.map((office) => office.city))).sort((a, b) => a.localeCompare(b, "ru"));
}

export async function getEuropostPickupPoints(city?: string) {
  const offices = await getEuropostOffices();
  if (!city) return offices;
  const normalized = city.trim().toLocaleLowerCase("ru");
  return offices.filter((office) => office.city.toLocaleLowerCase("ru") === normalized);
}

export async function requireEuropostOffice(id: string) {
  const office = (await getEuropostOffices()).find((item) => item.id === id);
  if (!office) throw new Error("Выбранное отделение Европочты недоступно. Обновите список.");
  return office;
}
