import { createPublicKey, verify } from "node:crypto";
import type { Order } from "./types";
import { safeEqual } from "./security";

type CheckoutInput = {
  orderId: string; amount: number; description: string; email: string; phone: string;
  customerName: string; ip?: string; receiptLines: string[];
};
type BePaidPayload = Record<string, unknown>;
export type BePaidPayment = {
  trackingId: string; token?: string; uid?: string; status: string; amount: number;
  currency: string; test: boolean; shopId: string; receiptUrl?: string;
};

function credentials() {
  const shopId = process.env.BEPAID_SHOP_ID;
  const secret = process.env.BEPAID_SECRET_KEY;
  if (!shopId || !secret) return null;
  return { shopId, basic: `Basic ${Buffer.from(`${shopId}:${secret}`).toString("base64")}` };
}

function appUrl() {
  const url = new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("NEXT_PUBLIC_APP_URL должен использовать HTTPS");
  return url.origin;
}

async function bePaidRequest(url: string, init: RequestInit) {
  const auth = credentials();
  if (!auth) throw new Error("bePaid не настроен");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url, {
      ...init,
      headers: { Authorization: auth.basic, Accept: "application/json", ...init.headers },
      signal: controller.signal,
      cache: "no-store",
    });
  } finally { clearTimeout(timeout); }
}

export async function createBePaidCheckout(input: CheckoutInput) {
  if (!credentials()) return null;
  const baseUrl = appUrl();
  const names = input.customerName.trim().split(/\s+/);
  const response = await bePaidRequest("https://checkout.bepaid.by/ctp/api/checkouts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ checkout: {
      test: process.env.BEPAID_TEST !== "false",
      transaction_type: "payment",
      attempts: 3,
      order: {
        amount: Math.round(input.amount * 100), currency: "BYN", description: input.description,
        tracking_id: input.orderId, expired_at: new Date(Date.now() + 30 * 60_000).toISOString(),
        additional_data: { receipt_text: input.receiptLines.slice(0, 10) },
      },
      customer: {
        first_name: names[0] || input.customerName, last_name: names.slice(1).join(" "),
        email: input.email, phone: input.phone, country: "BY", ip: input.ip,
      },
      settings: {
        success_url: `${baseUrl}/order/success?id=${encodeURIComponent(input.orderId)}`,
        decline_url: `${baseUrl}/order/failed?id=${encodeURIComponent(input.orderId)}`,
        fail_url: `${baseUrl}/order/failed?id=${encodeURIComponent(input.orderId)}`,
        cancel_url: `${baseUrl}/order/failed?id=${encodeURIComponent(input.orderId)}`,
        notification_url: `${baseUrl}/api/webhooks/bepaid`, language: "ru", auto_return: 5,
        button_next_text: "Вернуться в SAY",
        customer_fields: { read_only: ["email", "phone", "first_name", "last_name"] },
      },
    } }),
  });

  if (!response.ok) {
    console.error("bePaid checkout error", response.status, (await response.text()).slice(0, 500));
    throw new Error("Платёжный сервис временно недоступен");
  }
  const result = (await response.json()) as { checkout?: { redirect_url?: string; token?: string } };
  if (!result.checkout?.redirect_url || !result.checkout.token) throw new Error("bePaid не вернул токен оплаты");
  const redirect = new URL(result.checkout.redirect_url);
  if (redirect.protocol !== "https:" || !redirect.hostname.endsWith("bepaid.by")) throw new Error("bePaid вернул недопустимый адрес оплаты");
  return result.checkout as { redirect_url: string; token: string };
}

export function verifyBePaidAuth(header: string | null) {
  const auth = credentials();
  return Boolean(auth && header && safeEqual(header, auth.basic));
}

function publicKeyPem() {
  const raw = process.env.BEPAID_PUBLIC_KEY?.replace(/\\n/g, "\n").trim();
  if (!raw) return null;
  if (raw.includes("BEGIN PUBLIC KEY")) return raw;
  const clean = raw.replace(/\s/g, "");
  return `-----BEGIN PUBLIC KEY-----\n${clean.match(/.{1,64}/g)?.join("\n") || clean}\n-----END PUBLIC KEY-----`;
}

export function verifyBePaidSignature(rawBody: string, signature: string | null) {
  const pem = publicKeyPem();
  if (!pem || !signature) return false;
  try { return verify("RSA-SHA256", Buffer.from(rawBody), createPublicKey(pem), Buffer.from(signature, "base64")); }
  catch { return false; }
}

function record(value: unknown): BePaidPayload {
  return value && typeof value === "object" && !Array.isArray(value) ? value as BePaidPayload : {};
}

export function parseBePaidPayment(payload: unknown): BePaidPayment {
  const root = record(payload);
  const checkout = record(root.checkout || root);
  const gateway = record(checkout.gateway_response);
  const transaction = record(root.transaction || gateway.payment || gateway.authorization || checkout);
  const order = record(checkout.order || transaction.order);
  return {
    trackingId: String(order.tracking_id || transaction.tracking_id || ""),
    token: String(checkout.token || transaction.token || "") || undefined,
    uid: String(transaction.uid || "") || undefined,
    status: String(transaction.status || checkout.status || ""),
    amount: Number(transaction.amount ?? order.amount),
    currency: String(transaction.currency || order.currency || ""),
    test: Boolean(checkout.test ?? transaction.test),
    shopId: String(checkout.shop_id || transaction.shop_id || ""),
    receiptUrl: String(transaction.receipt_url || "") || undefined,
  };
}

export function assertPaymentMatchesOrder(payment: BePaidPayment, order: Order) {
  const auth = credentials();
  if (!auth || payment.shopId !== String(auth.shopId)) throw new Error("Неверный магазин bePaid");
  if (payment.trackingId !== order.id) throw new Error("Неверный номер заказа bePaid");
  if (payment.amount !== Math.round(order.total * 100) || payment.currency !== "BYN") throw new Error("Сумма или валюта платежа не совпадает");
  if (payment.test !== (process.env.BEPAID_TEST !== "false")) throw new Error("Режим платежа bePaid не совпадает");
  if (order.paymentToken && payment.token && payment.token !== order.paymentToken) throw new Error("Токен платежа не совпадает");
}

export async function queryBePaidPayment(order: Order) {
  if (!order.paymentToken) return null;
  const response = await bePaidRequest(`https://checkout.bepaid.by/ctp/api/checkouts/${encodeURIComponent(order.paymentToken)}`, { method: "GET" });
  if (!response.ok) throw new Error(`Не удалось проверить платёж: HTTP ${response.status}`);
  const payment = parseBePaidPayment(await response.json());
  assertPaymentMatchesOrder(payment, order);
  return payment;
}

export function isSuccessfulPayment(payment: BePaidPayment) {
  return payment.status === "successful" || payment.status === "succeeded";
}
