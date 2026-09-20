import { getOrders, saveOrder } from "@/lib/db";
import { isSuccessfulPayment, queryBePaidPayment } from "@/lib/bepaid";

export const dynamic = "force-dynamic";

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ id?: string; demo?: string }> }) {
  const { id, demo } = await searchParams;
  const order = id ? (await getOrders()).find((item) => item.id === id) : undefined;
  if (order && order.paymentStatus === "pending" && order.paymentToken) {
    try {
      const payment = await queryBePaidPayment(order);
      if (payment && isSuccessfulPayment(payment)) {
        order.paymentStatus = "paid";
        order.paymentUid = payment.uid;
        order.paymentReceiptUrl = payment.receiptUrl;
        order.paymentVerifiedAt = new Date().toISOString();
        await saveOrder(order);
      }
    } catch (error) { console.error("bePaid return reconciliation failed", error); }
  }
  const paid = order?.paymentStatus === "paid";
  const message = demo || order?.paymentStatus === "demo"
    ? "Это локальный демо-режим: платёж не списывался."
    : paid
      ? "Оплата подтверждена через API bePaid. Мы свяжемся с вами перед отправкой."
      : "Платёж ещё проверяется. Заказ сохранён; статус обновится автоматически после уведомления bePaid.";
  return <main className="admin-login"><section className="login-card"><a className="logo" href="/">SAY<span>.</span></a><p className="eyebrow">{paid ? "Оплата подтверждена" : "Заказ принят"}</p><h1>Спасибо!</h1><p>Заказ <b>{order?.id || "не найден"}</b> создан. {message}</p>{paid && order?.paymentReceiptUrl && <a className="ghost wide" href={order.paymentReceiptUrl} target="_blank" rel="noreferrer">Электронный чек ↗</a>}<a className="primary wide" href="/">Вернуться в магазин</a></section></main>;
}
