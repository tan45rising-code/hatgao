"use client";

/**
 * Live kitchen order board: polls for new orders, sounds an alert until
 * every `PLACED` order has been Accepted or Rejected, and exposes the one
 * contextual action each order card needs.
 *
 * Audio: `public/sounds/kitchen-alert.m4a` (Tan's own alert sound), looped
 * natively via the `<audio loop>` element rather than a JS interval —
 * simpler than the earlier synthesized-beep version, which had to
 * re-trigger itself on a timer since a Web Audio oscillator is a one-shot.
 *
 * Browsers block ANY audio element from playing without a prior user
 * gesture, so nothing plays until "Enable alert sound" is tapped. That
 * tap does a play()-then-immediately-pause() — the standard trick for
 * "unlocking" an `<audio>` element: it counts as the required user
 * gesture, so every *later* programmatic `.play()` call (triggered by a
 * poll finding a new order, not a click) is allowed to actually produce
 * sound. Skipping this step is why a naive `audioRef.current.play()`
 * from inside the polling effect below would silently do nothing on an
 * iPad that hasn't had the button tapped yet.
 *
 * Persisting "armed" (`SOUND_ARMED_STORAGE_KEY`): this component remounts
 * — losing all its state, including `soundArmed` — every time staff
 * navigate to a different admin page and back, e.g. tapping "Categories"
 * then "Orders" again. Without this, that meant re-tapping "Enable alert
 * sound" after every single navigation, which is exactly the complaint.
 * The fix leans on a real browser behavior rather than faking one:
 * client-side navigation (React Router / Next's `<Link>`) never reloads
 * the document, so the browser's own "has this page had a user gesture
 * yet" flag survives the remount even though React state doesn't — a
 * fresh, silent play()-then-pause() on mount succeeds without asking
 * again. Only a genuine full page reload (hard refresh, new login)
 * actually clears that flag, and in that case the silent attempt below
 * rejects and the button correctly reappears — there's no way around a
 * real browser security restriction, so this doesn't try to fake past
 * that case, only past the "just clicking around inside the app" one.
 */

import { useEffect, useRef, useState } from "react";
import { OrderCard } from "@/components/admin/order-card";
import { acceptOrderAction, advanceOrderStatusAction, pollActiveOrdersAction, rejectOrderAction } from "@/app/admin/(protected)/orders/actions";
import type { KitchenOrderSummary } from "@/server/orders/list-active";
import type { OrderStatus } from "@/server/orders/state-machine";

const POLL_INTERVAL_MS = 4500;
const SOUND_ARMED_STORAGE_KEY = "hatgao-kitchen-sound-armed";

export function KitchenBoard({ initialOrders }: { initialOrders: KitchenOrderSummary[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soundArmed, setSoundArmed] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const hasNewOrders = orders.some((o) => o.status === "PLACED");

  function armSound() {
    const audio = audioRef.current;
    if (!audio) return;
    audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
      })
      .catch(() => {
        // Some browsers still refuse even this — mark armed anyway so the
        // effect below at least tries; worst case, no sound, same as today.
      })
      .finally(() => {
        setSoundArmed(true);
        localStorage.setItem(SOUND_ARMED_STORAGE_KEY, "true");
      });
  }

  // Auto-re-arm on mount if this browser was armed before — see the
  // file-level doc comment for why this is allowed to work silently
  // rather than being a fake shortcut.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || localStorage.getItem(SOUND_ARMED_STORAGE_KEY) !== "true") return;

    audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        setSoundArmed(true);
      })
      .catch(() => {
        // A real page reload since it was last armed — the browser's
        // gesture flag is genuinely gone. Clear the stale flag so this
        // doesn't keep silently failing on every future mount too.
        localStorage.removeItem(SOUND_ARMED_STORAGE_KEY);
      });
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!soundArmed || !audio) return;

    if (hasNewOrders) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } else {
      audio.pause();
      audio.currentTime = 0;
    }
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
      <audio ref={audioRef} src="/sounds/kitchen-alert.m4a" loop preload="auto" />

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
