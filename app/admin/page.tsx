import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { getOrders, getProducts, getPrompts } from "@/lib/db";
import AdminDashboard from "@/components/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  return <AdminDashboard initialProducts={await getProducts(true)} initialOrders={await getOrders()} initialPrompts={await getPrompts()}/>;
}
