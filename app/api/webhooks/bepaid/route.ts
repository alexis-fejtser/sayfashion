import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getOrders, saveOrder } from "@/lib/db";
import { assertPaymentMatchesOrder, isSuccessfulPayment, parseBePaidPayment, verifyBePaidAuth, verifyBePaidSignature } from "@/lib/bepaid";

export async function POST(request: Request) {
  if (!verifyBePaidAuth(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rawBody = await request.text();
  if (!verifyBePaidSignature(rawBody, request.headers.get("content-signature"))) {
    console.error("Rejected bePaid webhook: invalid RSA signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payment;
  try { payment = parseBePaidPayment(JSON.parse(rawBody)); }
  catch { return NextResponse.json({ error: "Invalid payload" }, { status: 400 }); }

  const order = (await getOrders()).find((item) => item.id === payment.trackingId);
  if (!order) return NextResponse.json({ ok: true });
  try { assertPaymentMatchesOrder(payment, order); }
  catch (error) {
    console.error("Rejected bePaid webhook: payment mismatch", error);
    return NextResponse.json({ error: "Payment mismatch" }, { status: 409 });
  }

  const eventId = createHash("sha256").update(rawBody).digest("hex");
  if (order.paymentEventIds?.includes(eventId)) return NextResponse.json({ ok: true });
  order.paymentEventIds = [...(order.paymentEventIds || []).slice(-19), eventId];
  if (isSuccessfulPayment(payment)) {
    order.paymentStatus = "paid";
    order.paymentUid = payment.uid;
    order.paymentReceiptUrl = payment.receiptUrl;
    order.paymentVerifiedAt = new Date().toISOString();
  } else if (order.paymentStatus !== "paid" && ["failed", "declined", "error"].includes(payment.status)) {
    order.paymentStatus = "failed";
  }
  await saveOrder(order);
  return NextResponse.json({ ok: true });
}
