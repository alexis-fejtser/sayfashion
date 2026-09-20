import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getProducts, saveOrder } from "@/lib/db";
import { createBePaidCheckout } from "@/lib/bepaid";
import { requireEuropostOffice } from "@/lib/europost";
import { assertSameOrigin, rateLimit } from "@/lib/security";
import type { Order } from "@/lib/types";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    rateLimit(request, "checkout", 8, 10 * 60_000);
    const body = await request.json();
    if (!Array.isArray(body.items) || !body.items.length) throw new Error("Корзина пуста");
    for (const key of ["customerName", "phone", "email", "city", "pickupPointId"]) if (!String(body[key] || "").trim()) throw new Error("Заполните контактные данные и отделение");
    const office = await requireEuropostOffice(String(body.pickupPointId));
    if (office.city.toLocaleLowerCase("ru") !== String(body.city).trim().toLocaleLowerCase("ru")) throw new Error("Выбранное отделение не относится к указанному городу");
    const products = await getProducts();
    const items = body.items.map((raw: { productId: string; quantity: number; size: string }) => {
      const product = products.find((item) => item.id === raw.productId);
      if (!product) throw new Error("Один из товаров больше недоступен");
      const quantity = Math.min(Math.max(Number(raw.quantity) || 1, 1), 10);
      return { productId: product.id, title: product.title, price: product.price, quantity, size: String(raw.size || product.sizes[0] || "ONE") };
    });
    const subtotal = items.reduce((sum: number, item: { price: number; quantity: number }) => sum + item.price * item.quantity, 0);
    const delivery = Number(process.env.EUROPOST_DELIVERY_PRICE || 7.9);
    const order: Order = {
      id: `SAY-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${randomUUID().slice(0, 5).toUpperCase()}`,
      customerName: String(body.customerName).trim().slice(0, 120), phone: String(body.phone).trim().slice(0, 40), email: String(body.email).trim().slice(0, 160), city: office.city, pickupPointId: office.id, pickupPoint: office.name, comment: String(body.comment || "").trim().slice(0, 1000),
      items, subtotal, delivery, total: subtotal + delivery, paymentStatus: "pending", fulfillmentStatus: "new", createdAt: new Date().toISOString(),
    };
    const checkout = await createBePaidCheckout({
      orderId: order.id,
      amount: order.total,
      description: `Заказ ${order.id} в SAY`,
      email: order.email,
      phone: order.phone,
      customerName: order.customerName,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || undefined,
      receiptLines: [
        ...order.items.map((item) => `${item.title}, ${item.size}, ${item.quantity} шт. — ${(item.price * item.quantity).toFixed(2)} BYN`),
        `Доставка Европочтой — ${order.delivery.toFixed(2)} BYN`,
      ],
    });
    if (checkout) order.paymentToken = checkout.token;
    else order.paymentStatus = "demo";
    await saveOrder(order);
    return NextResponse.json({ orderId: order.id, redirectUrl: checkout?.redirect_url || null, demo: !checkout });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Ошибка заказа" }, { status: 400 }); }
}
