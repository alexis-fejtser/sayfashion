"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "@/lib/types";

type CartItem = { product: Product; size: string; quantity: number };
type EuropostOffice = { id: string; name: string; city: string; info: string; weightLimitKg: number | null };

function money(value: number) {
  return new Intl.NumberFormat("ru-BY", { style: "currency", currency: "BYN" }).format(value);
}

export default function Storefront({ products }: { products: Product[] }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState("");
  const [offices, setOffices] = useState<EuropostOffice[]>([]);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const [category, setCategory] = useState("Все");
  const [size, setSize] = useState("Все");
  const [sort, setSort] = useState("new");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [catalogActive, setCatalogActive] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState("");
  const heroRef = useRef<HTMLElement>(null);
  const catalogRef = useRef<HTMLElement>(null);
  const categories = ["Все", ...Array.from(new Set(products.map((product) => product.category)))];
  const sizes = ["Все", ...Array.from(new Set(products.flatMap((product) => product.sizes)))];
  const highestPrice = Math.ceil((Math.max(0, ...products.map((product) => product.price)) || 500) / 10) * 10;
  const [maxPrice, setMaxPrice] = useState(highestPrice);
  const visible = useMemo(() => {
    const filtered = products.filter((product) => (category === "Все" || product.category === category) && (size === "Все" || product.sizes.includes(size)) && product.price <= maxPrice);
    return [...filtered].sort((a, b) => sort === "price-low" ? a.price - b.price : sort === "price-high" ? b.price - a.price : b.createdAt.localeCompare(a.createdAt));
  }, [products, category, size, maxPrice, sort]);
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0), [cart]);
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    let frame = 0;
    const updateHero = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const shift = Math.min(window.scrollY * 0.34, 260);
        heroRef.current?.style.setProperty("--hero-shift", `${shift}px`);
        heroRef.current?.style.setProperty("--hero-opacity", String(Math.max(0.16, 1 - window.scrollY / (window.innerHeight * 0.72))));
      });
    };
    const observer = new IntersectionObserver(([entry]) => setCatalogActive(entry.isIntersecting), { threshold: 0.08 });
    if (catalogRef.current) observer.observe(catalogRef.current);
    updateHero(); window.addEventListener("scroll", updateHero, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", updateHero); observer.disconnect(); };
  }, []);

  async function openCheckout() {
    setCheckoutOpen(true); setCartOpen(false);
    if (cities.length) return;
    setDeliveryBusy(true); setDeliveryError("");
    try {
      const response = await fetch("/api/europost/offices?mode=cities");
      if (!response.ok) throw new Error((await response.json()).error);
      setCities(await response.json());
    } catch { setDeliveryError("Не удалось загрузить города Европочты. Попробуйте ещё раз."); }
    finally { setDeliveryBusy(false); }
  }

  async function changeCity(city: string) {
    setSelectedCity(city); setOffices([]);
    if (!city) return;
    setDeliveryBusy(true); setDeliveryError(""); setOffices([]);
    try {
      const response = await fetch(`/api/europost/offices?city=${encodeURIComponent(city)}`);
      if (!response.ok) throw new Error((await response.json()).error);
      setOffices(await response.json());
    } catch { setDeliveryError("Не удалось загрузить отделения Европочты."); }
    finally { setDeliveryBusy(false); }
  }

  function add(product: Product, chosenSize = product.sizes[0] || "ONE") {
    setCart((current) => {
      const found = current.find((item) => item.product.id === product.id && item.size === chosenSize);
      return found
        ? current.map((item) => (item === found ? { ...item, quantity: item.quantity + 1 } : item))
        : [...current, { product, size: chosenSize, quantity: 1 }];
    });
    setSelectedProduct(null);
    setCartOpen(true);
  }

  function openProduct(product: Product) {
    setSelectedProduct(product);
    setSelectedSize(product.sizes[0] || "ONE");
  }

  async function checkout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: form.get("name"), phone: form.get("phone"), email: form.get("email"),
        city: form.get("city"), pickupPointId: form.get("pickupPointId"), comment: form.get("comment"),
        items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity, size: item.size })),
      }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setError(result.error || "Не удалось оформить заказ");
    window.location.href = result.redirectUrl || `/order/success?id=${result.orderId}&demo=1`;
  }

  return (
    <main>
      <header className="nav shell">
        <a className="logo" href="#top">SAY<span>.</span></a>
        <nav><a href="#catalog">Каталог</a><span>Доставка по Беларуси</span></nav>
        <button className="cart-button" onClick={() => setCartOpen(true)}>Корзина <b>{count}</b></button>
      </header>

      <section className="hero" id="top" ref={heroRef}>
        <div className="hero-copy shell">
          <p className="eyebrow">Новая коллекция · Беларусь</p>
          <h1>Вещи,<br/><em>в которых живут.</em></h1>
          <p className="lead">Спокойные формы, честные детали и комфорт на каждый день.</p>
          <a className="hero-link" href="#catalog">Смотреть коллекцию <span>↓</span></a>
        </div>
        <div className="hero-index"><span>01</span><i></i><span>02</span></div>
      </section>

      <section className={`catalog ${catalogActive ? "catalog-active" : ""}`} id="catalog" ref={catalogRef}>
        <div className="catalog-head shell"><div><p className="eyebrow">Коллекция · {new Date().getFullYear()}</p><h2>Каталог</h2></div><p>Продуманные вещи для повседневной жизни.</p></div>
        <div className="catalog-layout shell">
          <aside className={`filter-panel ${filtersOpen ? "mobile-open" : ""}`}>
            <div className="filter-title"><b>Фильтры</b><button onClick={() => setFiltersOpen(false)}>×</button></div>
            <div className="filter-block"><span>Категории</span>{categories.map((item) => <button className={item === category ? "active" : ""} key={item} onClick={() => { setCategory(item); setFiltersOpen(false); }}>{item}<small>{item === "Все" ? products.length : products.filter((product) => product.category === item).length}</small></button>)}</div>
            <div className="filter-block"><span>Размер</span><div className="size-filter">{sizes.map((item) => <button className={item === size ? "active" : ""} key={item} onClick={() => setSize(item)}>{item}</button>)}</div></div>
            <div className="filter-block price-filter"><span>Цена до <b>{money(maxPrice)}</b></span><input aria-label="Максимальная цена" type="range" min={10} max={highestPrice} step={10} value={maxPrice} onChange={(event) => setMaxPrice(Number(event.target.value))}/><div><small>10 BYN</small><small>{money(highestPrice)}</small></div></div>
            <button className="reset-filters" onClick={() => { setCategory("Все"); setSize("Все"); setMaxPrice(highestPrice); }}>Сбросить фильтры</button>
          </aside>
          <div className="catalog-content">
            <div className="catalog-toolbar"><button className="mobile-filter-button" onClick={() => setFiltersOpen(true)}>Фильтры</button><span>{visible.length} {visible.length === 1 ? "модель" : "моделей"}</span><label>Сортировка<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="new">Сначала новые</option><option value="price-low">Сначала дешевле</option><option value="price-high">Сначала дороже</option></select></label></div>
            {visible.length ? <div className="product-grid">{visible.map((product) => (
              <article className="product" key={product.id}>
                <button className="product-image" onClick={() => openProduct(product)}><img src={product.image} alt={product.title}/><span>Посмотреть</span></button>
                <button className="product-summary" onClick={() => openProduct(product)}><span><b>{product.title}</b><small>{product.category}</small></span><strong>{money(product.price)}</strong></button>
              </article>
            ))}</div> : <div className="catalog-empty"><p>По этим фильтрам ничего не найдено.</p><button onClick={() => { setCategory("Все"); setSize("Все"); setMaxPrice(highestPrice); }}>Показать всё</button></div>}
          </div>
        </div>
      </section>

      <footer className="footer shell"><a className="logo" href="#top">SAY<span>.</span></a><p>bePaid · Европочта · Беларусь</p><a href="/admin">Для команды</a></footer>

      {selectedProduct && <div className="overlay product-overlay" onMouseDown={() => setSelectedProduct(null)}><article className="product-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSelectedProduct(null)}>×</button><div className="modal-image"><img src={selectedProduct.image} alt={selectedProduct.title}/></div><div className="modal-copy"><p className="eyebrow">{selectedProduct.category}</p><h2>{selectedProduct.title}</h2><strong className="modal-price">{money(selectedProduct.price)}</strong><p>{selectedProduct.description}</p><div className="modal-sizes"><span>Выберите размер</span><div>{selectedProduct.sizes.map((item) => <button className={selectedSize === item ? "active" : ""} key={item} onClick={() => setSelectedSize(item)}>{item}</button>)}</div></div>{selectedProduct.colors.length > 0 && <p className="modal-colors">Цвет: {selectedProduct.colors.join(", ")}</p>}<button className="primary wide" onClick={() => add(selectedProduct, selectedSize)}>Добавить в корзину</button><small className="modal-note">Доставка Европочтой по всей Беларуси</small></div></article></div>}

      {cartOpen && <div className="overlay" onMouseDown={() => setCartOpen(false)}><aside className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-head"><h2>Корзина</h2><button onClick={() => setCartOpen(false)}>×</button></div>
        {cart.length === 0 ? <p className="empty">Здесь пока пусто</p> : <>
          <div className="cart-list">{cart.map((item) => <div className="cart-row" key={`${item.product.id}-${item.size}`}><img src={item.product.image} alt=""/><div><b>{item.product.title}</b><small>Размер {item.size}</small><div className="qty"><button aria-label="Уменьшить количество" onClick={() => setCart((c) => item.quantity === 1 ? c.filter((x) => x !== item) : c.map((x) => x === item ? {...x, quantity: x.quantity - 1} : x))}>−</button><span>{item.quantity}</span><button aria-label="Увеличить количество" onClick={() => setCart((c) => c.map((x) => x === item ? {...x, quantity: x.quantity + 1} : x))}>+</button></div></div><strong>{money(item.product.price * item.quantity)}</strong></div>)}</div>
          <div className="cart-total"><span>Товары</span><b>{money(subtotal)}</b></div>
          <button className="primary wide" onClick={openCheckout}>Оформить заказ</button>
        </>}
      </aside></div>}

      {checkoutOpen && <div className="overlay"><div className="checkout-card"><div className="drawer-head"><div><p className="eyebrow">Последний шаг</p><h2>Оформление</h2></div><button onClick={() => setCheckoutOpen(false)}>×</button></div>
        <form onSubmit={checkout} className="checkout-form">
          <label>Имя<input name="name" required placeholder="Анна"/></label><label>Телефон<input name="phone" required placeholder="+375 29 000-00-00"/></label>
          <label>Email<input type="email" name="email" required placeholder="anna@example.by"/></label>
          <label>Город<select name="city" required value={selectedCity} onChange={(event) => changeCity(event.target.value)} disabled={deliveryBusy && !cities.length}><option value="">{deliveryBusy && !cities.length ? "Загружаем города…" : "Выберите город"}</option>{cities.map((city) => <option key={city} value={city}>{city}</option>)}</select></label>
          <label className="full">Отделение Европочты<select name="pickupPointId" required disabled={!selectedCity || deliveryBusy}><option value="">{!selectedCity ? "Сначала выберите город" : deliveryBusy ? "Загружаем отделения…" : "Выберите пункт выдачи"}</option>{offices.map((office) => <option key={office.id} value={office.id}>{office.name}{office.info ? ` — ${office.info}` : ""}</option>)}</select><small>Список и идентификаторы отделений загружены напрямую из API Европочты.</small></label>
          {deliveryError && <p className="form-error full">{deliveryError}</p>}
          <label className="full">Комментарий<textarea name="comment" rows={2}/></label>
          <div className="checkout-total full"><span>Товары + доставка</span><b>{money(subtotal + 7.9)}</b></div>
          {error && <p className="form-error full">{error}</p>}<button disabled={busy} className="primary wide full">{busy ? "Создаём заказ…" : "Перейти к оплате"}</button>
        </form>
      </div></div>}
    </main>
  );
}
