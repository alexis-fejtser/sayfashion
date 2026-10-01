import { promises as fs } from "node:fs";
import path from "node:path";
import type { AiPrompt, Order, Product, StoreData } from "./types";

const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "store.json");

const seedProducts: Product[] = [
  {
    id: "linen-shirt",
    slug: "linen-shirt",
    title: "Льняная рубашка",
    description: "Свободная рубашка из мягкого льна. Лёгкий силуэт на каждый день.",
    category: "Рубашки",
    price: 129,
    sizes: ["XS", "S", "M", "L"],
    colors: ["Молочный", "Графит"],
    image: "https://images.unsplash.com/photo-1605763240000-7e93b172d754?auto=format&fit=crop&w=1000&q=85",
    published: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "city-jacket",
    slug: "city-jacket",
    title: "Жакет City",
    description: "Чистая линия плеча и комфортная посадка. Работает и с денимом, и с костюмом.",
    category: "Жакеты",
    price: 239,
    sizes: ["S", "M", "L"],
    colors: ["Чёрный"],
    image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=1000&q=85",
    published: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "everyday-knit",
    slug: "everyday-knit",
    title: "Джемпер Everyday",
    description: "Тактильный трикотаж спокойного оттенка для многослойных образов.",
    category: "Трикотаж",
    price: 159,
    sizes: ["S", "M", "L", "XL"],
    colors: ["Песочный", "Шоколад"],
    image: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=1000&q=85",
    published: true,
    createdAt: new Date().toISOString(),
  },
];

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify({ products: seedProducts, orders: [], prompts: [] }, null, 2), "utf8");
  }
}

export async function readStore(): Promise<StoreData> {
  await ensureStore();
  try {
    const parsed = JSON.parse(await fs.readFile(dataFile, "utf8")) as Partial<StoreData>;
    return {
      products: parsed.products && parsed.products.length > 0 ? parsed.products : seedProducts,
      orders: parsed.orders || [],
      prompts: parsed.prompts || [],
    };
  } catch {
    return { products: seedProducts, orders: [], prompts: [] };
  }
}

let writeQueue = Promise.resolve();
async function writeStore(data: StoreData) {
  const operation = async () => {
    await ensureStore();
    const tmp = `${dataFile}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, dataFile);
  };
  writeQueue = writeQueue.then(operation, operation);
  return writeQueue;
}

export async function getProducts(includeHidden = false) {
  const { products } = await readStore();
  return includeHidden ? products : products.filter((product) => product.published);
}

export async function saveProduct(product: Product) {
  const data = await readStore();
  const index = data.products.findIndex((item) => item.id === product.id);
  if (index >= 0) data.products[index] = product;
  else data.products.unshift(product);
  await writeStore(data);
  return product;
}

export async function deleteProduct(id: string) {
  const data = await readStore();
  data.products = data.products.filter((product) => product.id !== id);
  await writeStore(data);
}

export async function saveOrder(order: Order) {
  const data = await readStore();
  const index = data.orders.findIndex((item) => item.id === order.id);
  if (index >= 0) data.orders[index] = order;
  else data.orders.unshift(order);
  await writeStore(data);
  return order;
}

export async function getOrders() {
  return (await readStore()).orders;
}

export async function getPrompts() {
  return (await readStore()).prompts;
}

export async function savePrompt(prompt: AiPrompt) {
  const data = await readStore();
  const index = data.prompts.findIndex((item) => item.id === prompt.id);
  if (index >= 0) data.prompts[index] = prompt;
  else data.prompts.unshift(prompt);
  await writeStore(data);
  return prompt;
}

export async function deletePrompt(id: string) {
  const data = await readStore();
  data.prompts = data.prompts.filter((prompt) => prompt.id !== id);
  await writeStore(data);
}

export async function checkDatabase() {
  return { storage: "json", ok: true } as const;
}
