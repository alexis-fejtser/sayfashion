"use client";

import { useRef, useState } from "react";
import type { AiPrompt, Order, Product } from "@/lib/types";

type Tab = "manual" | "ai" | "products" | "orders";
type FormState = { title: string; description: string; category: string; price: string; sizes: string; colors: string; image: string; published: boolean };
const emptyForm: FormState = { title: "", description: "", category: "", price: "", sizes: "XS, S, M, L", colors: "", image: "", published: true };
const defaultPrompt = "Фотореалистичная съёмка на взрослой модели в минималистичной студии. Светло-серый бесшовный фон, мягкий рассеянный свет, естественная поза, коммерческая fashion-съёмка.";

export default function AdminDashboard({ initialProducts, initialOrders, initialPrompts }: { initialProducts: Product[]; initialOrders: Order[]; initialPrompts: AiPrompt[] }) {
  const [tab, setTab] = useState<Tab>("manual");
  const [products, setProducts] = useState(initialProducts);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [preview, setPreview] = useState("");
  const [sourceData, setSourceData] = useState("");
  const [variantCount, setVariantCount] = useState(2);
  const [generatedVariants, setGeneratedVariants] = useState<string[]>([]);
  const [prompts, setPrompts] = useState(initialPrompts);
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [promptName, setPromptName] = useState("");
  const [promptText, setPromptText] = useState(defaultPrompt);
  const [promptBusy, setPromptBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (name: keyof FormState, value: string | boolean) => setForm((current) => ({ ...current, [name]: value }));

  function resetForm() {
    setForm(emptyForm); setPreview(""); setSourceData(""); setGeneratedVariants([]); setNotice("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function chooseFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setNotice("Выберите изображение JPG, PNG или WEBP.");
    if (file.size > 10 * 1024 * 1024) return setNotice("Изображение должно быть меньше 10 МБ.");
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result);
      setPreview(value); setSourceData(value); setGeneratedVariants([]); set("image", value); setNotice("");
    };
    reader.readAsDataURL(file);
  }

  async function generate() {
    if (!sourceData) return setNotice("Сначала загрузите фото вещи.");
    setBusy(true); setNotice("AI анализирует вещь и готовит карточку…");
    try {
      const response = await fetch("/api/admin/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: sourceData, count: variantCount, prompt: promptText }) });
      const result = await response.json();
      if (!response.ok) return setNotice(result.error || "Ошибка генерации");
      const variants = Array.isArray(result.generatedImages) ? result.generatedImages : [];
      if (!variants.length) return setNotice("OpenRouter не вернул изображения.");
      setForm({
        title: result.title, description: result.description, category: result.category,
        price: String(result.suggestedPrice), sizes: result.sizes.join(", "), colors: result.colors.join(", "),
        image: variants[0], published: true,
      });
      setGeneratedVariants(variants); setPreview(variants[0]);
      setNotice(`Готово вариантов: ${variants.length}. Выберите фото для карточки товара.`);
    } catch { setNotice("Не удалось связаться с OpenRouter."); }
    finally { setBusy(false); }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/admin/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await response.json();
      if (!response.ok) return setNotice(result.error || "Не удалось сохранить");
      setProducts((current) => [result, ...current.filter((product) => product.id !== result.id)]);
      resetForm(); setNotice("Товар опубликован в магазине.");
    } catch { setNotice("Не удалось сохранить товар."); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("Удалить товар?")) return;
    const response = await fetch(`/api/admin/products?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) setProducts((current) => current.filter((product) => product.id !== id));
  }

  function choosePrompt(id: string) {
    setSelectedPromptId(id);
    const saved = prompts.find((prompt) => prompt.id === id);
    if (saved) { setPromptName(saved.name); setPromptText(saved.text); }
    else { setPromptName(""); setPromptText(defaultPrompt); }
  }

  async function saveCurrentPrompt() {
    if (!promptName.trim() || !promptText.trim()) return setNotice("Укажите название и текст промпта.");
    setPromptBusy(true); setNotice("");
    try {
      const existing = prompts.find((prompt) => prompt.id === selectedPromptId);
      const response = await fetch("/api/admin/prompts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedPromptId || undefined, name: promptName, text: promptText, createdAt: existing?.createdAt }),
      });
      const result = await response.json();
      if (!response.ok) return setNotice(result.error || "Не удалось сохранить промпт");
      setPrompts((current) => [result, ...current.filter((prompt) => prompt.id !== result.id)]);
      setSelectedPromptId(result.id);
      setPromptName(result.name); setPromptText(result.text);
      setNotice(existing ? "Промпт обновлён." : "Промпт сохранён и выбран.");
    } catch { setNotice("Не удалось сохранить промпт."); }
    finally { setPromptBusy(false); }
  }

  async function removeCurrentPrompt() {
    if (!selectedPromptId || !confirm("Удалить сохранённый промпт?")) return;
    setPromptBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/admin/prompts?id=${encodeURIComponent(selectedPromptId)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) return setNotice(result.error || "Не удалось удалить промпт");
      setPrompts((current) => current.filter((prompt) => prompt.id !== selectedPromptId));
      setSelectedPromptId(""); setPromptName(""); setPromptText(defaultPrompt);
      setNotice("Промпт удалён.");
    } catch { setNotice("Не удалось удалить промпт."); }
    finally { setPromptBusy(false); }
  }

  async function logout() { await fetch("/api/admin/logout", { method: "POST" }); window.location.href = "/admin/login"; }

  const imagePicker = (
    <div className="dropzone" onClick={() => fileRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]); }}>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => chooseFile(event.target.files?.[0])}/>
      {preview ? <img src={preview} alt="Предпросмотр товара"/> : <div><span>Фото товара</span><strong>Перетащите изображение</strong><span>или нажмите для выбора · до 10 МБ</span></div>}
    </div>
  );

  const productFields = <>
    <label>Название<input value={form.title} onChange={(event) => set("title", event.target.value)} required placeholder="Например, рубашка Relax"/></label>
    <label>Категория<input value={form.category} onChange={(event) => set("category", event.target.value)} required placeholder="Рубашки"/></label>
    <label className="full">Описание<textarea value={form.description} onChange={(event) => set("description", event.target.value)} required placeholder="Коротко расскажите о товаре"/></label>
    <label>Цена, BYN<input type="number" min="0.01" step="0.01" value={form.price} onChange={(event) => set("price", event.target.value)} required placeholder="129.00"/></label>
    <label>Размеры через запятую<input value={form.sizes} onChange={(event) => set("sizes", event.target.value)}/></label>
    <label>Цвета через запятую<input value={form.colors} onChange={(event) => set("colors", event.target.value)} placeholder="Молочный, графит"/></label>
    <label>Изображение<input value={form.image.startsWith("data:") ? "Фото загружено" : form.image} onChange={(event) => { set("image", event.target.value); setPreview(event.target.value); }} required placeholder="Загрузите фото или вставьте URL" readOnly={form.image.startsWith("data:")}/></label>
  </>;

  return <main className="admin-body"><div className="admin-wrap">
    <header className="admin-nav"><a className="logo" href="/">SAY<span>.</span></a><div><a className="ghost" href="/" target="_blank">Открыть магазин ↗</a><button className="ghost" onClick={logout}>Выйти</button></div></header>
    <div className="admin-title"><div><p className="eyebrow">Управление магазином</p><h1>Добрый день</h1></div><div className="admin-tabs">
      <button className={tab === "manual" ? "active" : ""} onClick={() => { setTab("manual"); setNotice(""); }}>Добавить товар</button>
      <button className={tab === "ai" ? "active" : ""} onClick={() => { setTab("ai"); setNotice(""); }}>✦ AI-студия</button>
      <button className={tab === "products" ? "active" : ""} onClick={() => setTab("products")}>Товары · {products.length}</button>
      <button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>Заказы · {initialOrders.length}</button>
    </div></div>

    {tab === "manual" && <section className="admin-panel">
      <div className="panel-heading"><div><p className="eyebrow">Новый товар</p><h2>Добавить вручную</h2></div><p>Заполните основные поля и опубликуйте товар.</p></div>
      <div className="admin-grid">{imagePicker}<form className="admin-form" onSubmit={save}>{notice && <div className="notice">{notice}</div>}{productFields}<div className="admin-actions"><button className="primary" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить и опубликовать"}</button><button type="button" className="ghost" onClick={resetForm}>Очистить</button></div></form></div>
    </section>}

    {tab === "ai" && <section className="admin-panel ai-panel">
      <div className="panel-heading"><div><p className="eyebrow">OpenRouter · виртуальная съёмка</p><h2>AI-студия</h2></div><p>Загрузите фото одежды без модели. AI перенесёт эту вещь на модель и создаст до четырёх студийных кадров с разными ракурсами.</p></div>
      <div className="prompt-editor">
        <div className="prompt-heading"><div><b>Промпт для фотосъёмки</b><span>Опишите модель, фон, свет, позу и стиль кадра.</span></div><label>Сохранённые промпты<select value={selectedPromptId} onChange={(event) => choosePrompt(event.target.value)} disabled={promptBusy}><option value="">Новый промпт</option>{prompts.map((prompt) => <option value={prompt.id} key={prompt.id}>{prompt.name}</option>)}</select></label></div>
        <textarea value={promptText} onChange={(event) => setPromptText(event.target.value)} maxLength={4000} placeholder="Например: взрослая модель, белая студия, мягкий боковой свет…"/>
        <div className="prompt-actions"><input value={promptName} onChange={(event) => setPromptName(event.target.value)} maxLength={80} placeholder="Название шаблона, например: Каталог — светлый фон"/><button type="button" className="ghost" disabled={promptBusy || !promptName.trim() || !promptText.trim()} onClick={saveCurrentPrompt}>{promptBusy ? "Сохраняем…" : selectedPromptId ? "Обновить промпт" : "Сохранить промпт"}</button>{selectedPromptId && <button type="button" className="prompt-delete" disabled={promptBusy} onClick={removeCurrentPrompt}>Удалить</button>}</div>
      </div>
      <div className="admin-grid">{imagePicker}<form className="admin-form" onSubmit={save}>
        <div className="ai-controls full"><label>Количество вариантов<select value={variantCount} onChange={(event) => setVariantCount(Number(event.target.value))} disabled={busy}>{[1,2,3,4].map((count) => <option key={count} value={count}>{count} {count === 1 ? "фото" : "фото"}</option>)}</select></label><button type="button" className="primary" disabled={busy || !sourceData} onClick={generate}>{busy ? `Создаём ${variantCount} вариант${variantCount > 1 ? "а" : ""}…` : "✦ Создать фото на модели"}</button><button type="button" className="ghost" onClick={resetForm}>Очистить</button></div>
        {notice && <div className="notice">{notice}</div>}
        {generatedVariants.length > 0 && <div className="variant-section full"><div className="variant-heading"><b>Выберите главное фото</b><span>{generatedVariants.length} вариант(а)</span></div><div className="variant-grid">{generatedVariants.map((image, index) => <button type="button" key={`${image.slice(0, 40)}-${index}`} className={form.image === image ? "selected" : ""} onClick={() => { set("image", image); setPreview(image); }}><img src={image} alt={`AI-вариант ${index + 1}`}/><span>{form.image === image ? "Выбрано" : `Вариант ${index + 1}`}</span></button>)}</div></div>}
        {productFields}<div className="admin-actions"><button className="primary" disabled={busy || !form.title || generatedVariants.length === 0}>Сохранить выбранный вариант</button></div>
      </form></div>
    </section>}

    {tab === "products" && <section className="admin-panel"><div className="panel-heading"><div><p className="eyebrow">Каталог</p><h2>Все товары</h2></div><button className="primary" onClick={() => { resetForm(); setTab("manual"); }}>+ Добавить товар</button></div><table className="product-table"><thead><tr><th></th><th>Товар</th><th>Категория</th><th>Цена</th><th></th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><img src={product.image} alt=""/></td><td><b>{product.title}</b><br/><small>{product.published ? "Опубликован" : "Скрыт"}</small></td><td>{product.category}</td><td>{product.price.toFixed(2)} BYN</td><td><button onClick={() => remove(product.id)}>Удалить</button></td></tr>)}</tbody></table></section>}

    {tab === "orders" && <section className="admin-panel"><div className="panel-heading"><div><p className="eyebrow">Продажи</p><h2>Заказы</h2></div></div>{initialOrders.length === 0 ? <p className="empty">Заказов пока нет</p> : initialOrders.map((order) => <article className="order-card" key={order.id}><div><h3>Заказ {order.id}</h3><p>{order.customerName} · {order.phone} · {order.email}</p><p>Европочта: {order.city}, {order.pickupPoint}</p><p>{order.items.map((item) => `${item.title} × ${item.quantity} (${item.size})`).join(", ")}</p><b>{order.total.toFixed(2)} BYN</b></div><span className="status">{order.paymentStatus === "paid" ? "Оплачен" : order.paymentStatus === "demo" ? "Демо" : "Ожидает оплаты"}</span></article>)}</section>}
  </div></main>;
}
