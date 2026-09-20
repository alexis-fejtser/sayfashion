import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "say_admin";

function signature(value: string) {
  const secret = process.env.AUTH_SECRET || "local-dev-secret-change-me";
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function createAdminToken() {
  const payload = Buffer.from(JSON.stringify({ role: "admin", exp: Date.now() + 7 * 86400000 })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyAdminToken(token?: string) {
  if (!token) return false;
  const [payload, provided] = token.split(".");
  if (!payload || !provided) return false;
  const expected = signature(payload);
  if (provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as { role: string; exp: number };
    return parsed.role === "admin" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

export async function isAdmin() {
  return verifyAdminToken((await cookies()).get(COOKIE_NAME)?.value);
}

export const adminCookie = { name: COOKIE_NAME, options: { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 7 * 86400 } };
