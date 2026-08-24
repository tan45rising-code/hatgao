"use client";

/**
 * The order status page (`src/app/(customer)/order/[token]/page.tsx`)
 * used to be static per page load — fine once an order was already
 * PLACED, but a customer landing here right after paying would see
 * "Confirming your payment…" and then nothing would ever change unless
 * they manually refreshed, even though the webhook flips it to PLACED
 * (or further) seconds later. This polls until the status is terminal.
 *
 * `isTerminal`/`OrderStatus` are pure (no DB/Node imports), safe to bundle
 * into client code — same reasoning `status-copy.ts` and
 * `state-machine.ts` were already written client-safe for.
 */

import { useEffect, useState } from "react";
import { getOrderStatusSnapshotAction } from "@/app/(customer)/order/[token]/actions";
import { isTerminal, type OrderStatus } from "@/server/orders/state-machine";

const POLL_INTERVAL_MS = 4000;

export function OrderStatusLive({
  token,
  initialStatus,
  initialStatusCopy,
}: {
  token: string;
  initialStatus: OrderStatus;
  initialStatusCopy: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [statusCopy, setStatusCopy] = useState(initialStatusCopy);

  useEffect(() => {
    if (isTerminal(status)) return;

    let cancelled = false;
    const timer = setInterval(async () => {
      const snapshot = await getOrderStatusSnapshotAction(token);
      if (cancelled || !snapshot) return;
      setStatus(snapshot.status);
      setStatusCopy(snapshot.statusCopy);
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token, status]);

  return <p className="mb-6 text-base text-hg-brown">{statusCopy}</p>;
}
