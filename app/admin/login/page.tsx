"use client";

import { useState } from "react";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const password = new FormData(event.currentTarget).get("password");
    const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    setBusy(false);
    if (response.ok) window.location.href = "/admin"; else setError("Неверный пароль");
  }
  return <main className="admin-login"><form className="login-card" onSubmit={submit}><a className="logo" href="/">SAY<span>.</span></a><h1>Вход в админку</h1><p>Товары, заказы и AI-фотостудия в одном месте.</p><label>Пароль<input name="password" type="password" autoFocus required/></label>{error && <p className="form-error">{error}</p>}<button className="primary wide" disabled={busy}>{busy ? "Входим…" : "Войти"}</button></form></main>;
}
