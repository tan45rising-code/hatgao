"use client";

/**
 * One order on the kitchen board. Presentational — all state and Server
 * Action calls live in `kitchen-board.tsx`, which passes down the single
 * contextual action this card's status calls for.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { formatCents } from "@/lib/money";
import type { KitchenOrderSummary } from "@/server/orders/list-active";
import type { OrderStatus } from "@/server/orders/state-machine";

const STATUS_LABEL: Record<string, string> = {
  PLACED: "New",
  ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  READY: "Ready",
  AWAITING_PICKUP: "Awaiting pickup",
};

const STATUS_BADGE_VARIANT: Record<string, "warning" | "success" | "neutral"> = {
  PLACED: "warning",
  ACCEPTED: "neutral",
  PREPARING: "neutral",
  READY: "success",
  AWAITING_PICKUP: "success",
};

export function OrderCard({
  order,
  busy,
  onAccept,
  onReject,
  onAdvance,
}: {
  order: KitchenOrderSummary;
  busy: boolean;
  onAccept: () => void;
  onReject: (reason: string) => void;
  onAdvance: (to: OrderStatus) => void;
}) {
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [reason, setReason] = useState("");

  const elapsedMinutes = Math.round((Date.now() - order.createdAt.getTime()) / 60_000);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-neutral-900">{order.orderNumber}</span>
            <Badge variant={STATUS_BADGE_VARIANT[order.status] ?? "neutral"}>
              {STATUS_LABEL[order.status] ?? order.status}
            </Badge>
          </div>
          <p className="text-sm text-neutral-600">
            {order.customerName} · {order.customerPhone}
          </p>
        </div>
        <div className="text-right text-xs text-neutral-500">
          <div>{elapsedMinutes <= 0 ? "just now" : `${elapsedMinutes} min ago`}</div>
          <div className="font-medium text-neutral-900">{formatCents(order.totalCents)}</div>
        </div>
      </div>

      <ul className="mt-3 space-y-1 text-sm text-neutral-800">
        {order.items.map((item) => (
          <li key={item.id}>
            <span className="font-medium">
              {item.quantity}× {item.menuNumber ? `#${item.menuNumber} ` : ""}
              {item.nameSnapshot}
            </span>
            {item.modifiers.length > 0 && (
              <span className="text-neutral-500"> — {item.modifiers.map((m) => m.name).join(", ")}</span>
            )}
            {item.notes && (
              <div className="pl-4 text-xs italic text-neutral-500">&ldquo;{item.notes}&rdquo;</div>
            )}
          </li>
        ))}
      </ul>

      {order.notes && (
        <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">Note: {order.notes}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {order.status === "PLACED" && !showRejectForm && (
          <>
            <Button size="sm" onClick={onAccept} disabled={busy}>
              Accept
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setShowRejectForm(true)} disabled={busy}>
              Reject
            </Button>
          </>
        )}

        {order.status === "PLACED" && showRejectForm && (
          <div className="w-full space-y-2">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (shown in our records, not to the customer)"
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                disabled={busy || reason.trim().length === 0}
                onClick={() => onReject(reason.trim())}
              >
                Confirm reject
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setShowRejectForm(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {order.status === "ACCEPTED" && (
          <Button size="sm" onClick={() => onAdvance("PREPARING")} disabled={busy}>
            Start preparing
          </Button>
        )}
        {order.status === "PREPARING" && (
          <Button size="sm" onClick={() => onAdvance("READY")} disabled={busy}>
            Mark ready
          </Button>
        )}
        {order.status === "READY" && (
          <Button size="sm" onClick={() => onAdvance("AWAITING_PICKUP")} disabled={busy}>
            Ready for pickup
          </Button>
        )}
        {order.status === "AWAITING_PICKUP" && (
          <Button size="sm" onClick={() => onAdvance("COMPLETED")} disabled={busy}>
            Mark collected
          </Button>
        )}
      </div>
    </div>
  );
}
