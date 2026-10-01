import { promises as fs } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import type { AiPrompt, Order, Product, StoreData } from "./types";

const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "store.json");
const databaseUrl = process.env.DATABASE_URL;
const databaseConfigured = Boolean(databaseUrl || process.env.PGHOST);

const globalDatabase = globalThis as unknown as { sayFashionPool?: Pool; sayFashionReady?: Promise<void> };

function getPool() {
  if (!databaseConfigured) throw new Error("PostgreSQL не настроен");
  globalDatabase.sayFashionPool ||= new Pool({
    ...(databaseUrl ? { connectionString: databaseUrl } : {}),
    max: Number(process.env.DATABASE_POOL_SIZE) || 10,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  return globalDatabase.sayFashionPool;
}

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

async function ensurePostgres() {
  if (!databaseConfigured) return;
  if (!globalDatabase.sayFashionReady) {
    const initialize = (async () => {
      const pool = getPool();
      await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        published BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ai_prompts (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS products_published_created_idx ON products (published, created_at DESC);
      CREATE INDEX IF NOT EXISTS orders_created_idx ON orders (created_at DESC);
      CREATE INDEX IF NOT EXISTS ai_prompts_created_idx ON ai_prompts (created_at DESC);
      `);
      const existing = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM products");
      if (existing.rows[0]?.count === "0") {
        for (const product of seedProducts) {
          await pool.query(
            "INSERT INTO products (id, data, published, created_at) VALUES ($1, $2::jsonb, $3, $4) ON CONFLICT (id) DO NOTHING",
            [product.id, JSON.stringify(product), product.published, product.createdAt],
          );
        }
      }
    })();
    globalDatabase.sayFashionReady = initialize.catch((error) => {
      globalDatabase.sayFashionReady = undefined;
      throw error;
    });
  }
  return globalDatabase.sayFashionReady;
}

async function readPostgres(): Promise<StoreData> {
  await ensurePostgres();
  const pool = getPool();
  const [products, orders, prompts] = await Promise.all([
    pool.query<{ data: Product }>("SELECT data FROM products ORDER BY created_at DESC"),
    pool.query<{ data: Order }>("SELECT data FROM orders ORDER BY created_at DESC"),
    pool.query<{ data: AiPrompt }>("SELECT data FROM ai_prompts ORDER BY created_at DESC"),
  ]);
  return {
    products: products.rows.map((row) => row.data),
    orders: orders.rows.map((row) => row.data),
    prompts: prompts.rows.map((row) => row.data),
  };
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify({ products: seedProducts, orders: [], prompts: [] }, null, 2), "utf8");
  }
}

export async function readStore(): Promise<StoreData> {
  if (databaseConfigured) return readPostgres();
  await ensureStore();
  const parsed = JSON.parse(await fs.readFile(dataFile, "utf8")) as Partial<StoreData>;
  return { products: parsed.products || [], orders: parsed.orders || [], prompts: parsed.prompts || [] };
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
  if (databaseConfigured) {
    await ensurePostgres();
    await getPool().query(
      `INSERT INTO products (id, data, published, created_at) VALUES ($1, $2::jsonb, $3, $4)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, published = EXCLUDED.published, created_at = EXCLUDED.created_at`,
      [product.id, JSON.stringify(product), product.published, product.createdAt],
    );
    return product;
  }
  const data = await readStore();
  const index = data.products.findIndex((item) => item.id === product.id);
  if (index >= 0) data.products[index] = product;
  else data.products.unshift(product);
  await writeStore(data);
  return product;
}

export async function deleteProduct(id: string) {
  if (databaseConfigured) {
    await ensurePostgres();
    await getPool().query("DELETE FROM products WHERE id = $1", [id]);
    return;
  }
  const data = await readStore();
  data.products = data.products.filter((product) => product.id !== id);
  await writeStore(data);
}

export async function saveOrder(order: Order) {
  if (databaseConfigured) {
    await ensurePostgres();
    await getPool().query(
      `INSERT INTO orders (id, data, created_at) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, created_at = EXCLUDED.created_at`,
      [order.id, JSON.stringify(order), order.createdAt],
    );
    return order;
  }
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
  if (databaseConfigured) {
    await ensurePostgres();
    await getPool().query(
      `INSERT INTO ai_prompts (id, data, created_at) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, created_at = EXCLUDED.created_at`,
      [prompt.id, JSON.stringify(prompt), prompt.createdAt],
    );
    return prompt;
  }
  const data = await readStore();
  const index = data.prompts.findIndex((item) => item.id === prompt.id);
  if (index >= 0) data.prompts[index] = prompt;
  else data.prompts.unshift(prompt);
  await writeStore(data);
  return prompt;
}

export async function deletePrompt(id: string) {
  if (databaseConfigured) {
    await ensurePostgres();
    await getPool().query("DELETE FROM ai_prompts WHERE id = $1", [id]);
    return;
  }
  const data = await readStore();
  data.prompts = data.prompts.filter((prompt) => prompt.id !== id);
  await writeStore(data);
}

export async function checkDatabase() {
  if (!databaseConfigured) return { storage: "json", ok: true } as const;
  await ensurePostgres();
  await getPool().query("SELECT 1");
  return { storage: "postgresql", ok: true } as const;
}
