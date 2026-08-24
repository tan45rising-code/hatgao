import { getActiveOrders } from "@/server/orders/list-active";
import { KitchenBoard } from "@/components/admin/kitchen-board";

/**
 * The kitchen order board. Reachable by STAFF (the default role per
 * `middleware.ts` — no OWNER requirement here), since this is exactly the
 * page a kitchen tablet login needs to reach.
 */
export default async function OrdersPage() {
  const orders = await getActiveOrders();
  return <KitchenBoard initialOrders={orders} />;
}
