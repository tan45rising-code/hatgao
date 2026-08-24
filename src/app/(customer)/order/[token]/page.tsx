import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { formatCents } from "@/lib/money";
import { getSettings } from "@/server/settings/get-settings";
import { orderStatusCopy } from "@/server/orders/status-copy";
import type { OrderStatus } from "@/server/orders/state-machine";
import { OrderStatusLive } from "@/components/customer/order-status-live";

/**
 * Public order status page — no auth. `publicToken` (an unguessable
 * UUID) is the security boundary, not a session, per H.3: never expose a
 * sequential id here, only this token. The status line itself is a
 * client component that polls (`OrderStatusLive`) — a customer landing
 * here right after paying used to see "Confirming your payment…" and
 * then nothing would ever update without a manual refresh, even once the
 * webhook had long since moved the order along. Everything else on this
 * page (the receipt, the collection details) doesn't change after
 * checkout, so it stays a plain server-rendered fetch.
 */
export default async function OrderStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const [order, settings] = await Promise.all([
    prisma.order.findUnique({
      where: { publicToken: token },
      include: { items: { include: { modifiers: true } } },
    }),
    getSettings(),
  ]);

  if (!order) notFound();

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="mb-1 font-display text-2xl font-semibold text-hg-ink">Order {order.orderNumber}</h1>
      <OrderStatusLive
        token={token}
        initialStatus={order.status as OrderStatus}
        initialStatusCopy={orderStatusCopy(order.status as OrderStatus)}
      />

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <ul className="space-y-2 text-sm text-hg-ink">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-2">
              <span>
                {item.quantity}× {item.menuNumber ? `#${item.menuNumber} ` : ""}
                {item.nameSnapshot}
                {item.modifiers.length > 0 && (
                  <span className="block text-xs text-hg-brown/60">
                    {item.modifiers.map((m) => m.nameSnapshot).join(", ")}
                  </span>
                )}
                {item.notes && (
                  <span className="block text-xs italic text-hg-brown/50">&ldquo;{item.notes}&rdquo;</span>
                )}
              </span>
              <span className="shrink-0 font-medium">{formatCents(item.lineTotalCents)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 space-y-1 border-t border-hg-brown/10 pt-3 text-sm">
          <div className="flex justify-between text-hg-brown/70">
            <span>Subtotal</span>
            <span>{formatCents(order.subtotalCents)}</span>
          </div>
          {order.discountCents > 0 && (
            <div className="flex justify-between text-hg-brown/70">
              <span>Discount</span>
              <span>-{formatCents(order.discountCents)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold text-hg-ink">
            <span>Total</span>
            <span>{formatCents(order.totalCents)}</span>
          </div>
          <p className="text-xs text-hg-brown/50">Includes {formatCents(order.vatTotalCents)} VAT</p>
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-white p-4 text-sm text-hg-ink shadow-sm">
        <p className="font-semibold">Collection</p>
        <p className="text-hg-brown/70">
          {settings.restaurantName}, {settings.addressLine}, {settings.city}
        </p>
        <p className="text-hg-brown/70">{settings.phone}</p>
        {order.promisedReadyAt && (
          <p className="mt-2 text-hg-brown/70">
            Ready around{" "}
            {new Intl.DateTimeFormat("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: settings.timezone,
            }).format(order.promisedReadyAt)}
          </p>
        )}
      </div>
    </div>
  );
}
