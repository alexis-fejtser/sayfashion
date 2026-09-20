import { timingSafeEqual } from "node:crypto";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin && process.env.NODE_ENV !== "production") return;
  const expected = process.env.NODE_ENV === "production"
    ? new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin
    : new URL(request.url).origin;
  if (!origin || origin !== expected) throw new Error("Недопустимый источник запроса");
}

export function rateLimit(request: Request, name: string, limit: number, windowMs: number) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "local";
  const key = `${name}:${ip}`;
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > limit) throw new Error("Слишком много попыток. Подождите несколько минут.");
  if (buckets.size > 5_000) for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey);
}
