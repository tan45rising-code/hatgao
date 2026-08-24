"use client";

/**
 * Live kitchen order board: polls for new orders, sounds an alert until
 * every `PLACED` order has been Accepted or Rejected, and exposes the one
 * contextual action each order card needs.
 *
 * Audio: browsers block `AudioContext` sound from ever starting without a
 * prior user gesture, so nothing plays until "Enable alert sound" is
 * tapped — that tap is what's allowed to create the `AudioContext` at
 * all. This is a real UX step on a kitchen tablet, not an optional extra.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { OrderCard } from "@/components/admin/order-card";
import { playBeep } from "@/lib/kitchen-audio";
import { acceptOrderAction, advanceOrderStatusAction, pollActiveOrdersAction, rejectOrderAction } from "@/app/admin/(protected)/orders/actions";
import type { KitchenOrderSummary } from "@/server/orders/list-active";
import type { OrderStatus } from "@/server/orders/state-machine";

const POLL_INTERVAL_MS = 4500;
const BEEP_INTERVAL_MS = 2500;

export function KitchenBoard({ initialOrders }: { initialOrders: KitchenOrderSummary[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soundArmed, setSoundArmed] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const beepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasNewOrders = orders.some((o) => o.status === "PLACED");

  const armSound = useCallback(() => {
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    audioCtxRef.current = new AudioContextCtor();
    setSoundArmed(true);
  }, []);

  useEffect(() => {
    if (!soundArmed || !audioCtxRef.current) return;

    if (hasNewOrders) {
      playBeep(audioCtxRef.current);
      beepTimerRef.current = setInterval(() => {
        if (audioCtxRef.current) playBeep(audioCtxRef.current);
      }, BEEP_INTERVAL_MS);
    }

    return () => {
      if (beepTimerRef.current) clearInterval(beepTimerRef.current);
      beepTimerRef.current = null;
    };
  }, [soundArmed, hasNewOrders]);

  useEffect(() => {
    const timer = setInterval(async () => {
      const result = await pollActiveOrdersAction();
      setOrders(result.orders);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  async function handleAccept(orderId: string, version: number) {
    setBusyOrderId(orderId);
    setError(null);
    const result = await acceptOrderAction(orderId, version);
    setOrders(result.orders);
    if (!result.ok) setError(result.error ?? "Couldn't accept the order.");
    setBusyOrderId(null);
  }

  async function handleReject(orderId: string, version: number, reason: string) {
    setBusyOrderId(orderId);
    setError(null);
    const result = await rejectOrderAction(orderId, version, reason);
    setOrders(result.orders);
    if (!result.ok) setError(result.error ?? "Couldn't reject the order.");
    setBusyOrderId(null);
  }

  async function handleAdvance(orderId: string, version: number, to: OrderStatus) {
    setBusyOrderId(orderId);
    setError(null);
    const result = await advanceOrderStatusAction(orderId, version, to);
    setOrders(result.orders);
    if (!result.ok) setError(result.error ?? "Couldn't update the order.");
    setBusyOrderId(null);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Orders</h1>
        {!soundArmed && (
          <button
            onClick={armSound}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Enable alert sound
          </button>
        )}
      </div>

      {error && <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {orders.length === 0 ? (
        <p className="text-sm text-neutral-500">No active orders.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              busy={busyOrderId === order.id}
              onAccept={() => handleAccept(order.id, order.version)}
              onReject={(reason) => handleReject(order.id, order.version, reason)}
              onAdvance={(to) => handleAdvance(order.id, order.version, to)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
