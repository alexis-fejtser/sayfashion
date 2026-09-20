export type Product = {
  id: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  price: number;
  sizes: string[];
  colors: string[];
  image: string;
  published: boolean;
  createdAt: string;
};

export type OrderItem = {
  productId: string;
  title: string;
  price: number;
  quantity: number;
  size: string;
};

export type Order = {
  id: string;
  customerName: string;
  phone: string;
  email: string;
  city: string;
  pickupPointId: string;
  pickupPoint: string;
  comment: string;
  items: OrderItem[];
  subtotal: number;
  delivery: number;
  total: number;
  paymentStatus: "pending" | "paid" | "failed" | "demo";
  fulfillmentStatus: "new" | "processing" | "shipped" | "completed";
  paymentToken?: string;
  paymentUid?: string;
  paymentReceiptUrl?: string;
  paymentVerifiedAt?: string;
  paymentEventIds?: string[];
  createdAt: string;
};

export type AiPrompt = {
  id: string;
  name: string;
  text: string;
  createdAt: string;
};

export type StoreData = { products: Product[]; orders: Order[]; prompts: AiPrompt[] };
