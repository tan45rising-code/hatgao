"use client";

import { useCallback, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const DELETE_THRESHOLD = 80;
const OFFSCREEN_PX = 400;
/** Matches the timeout below — the swipe-away animation needs to finish
 * before the underlying cart data actually changes and this row unmounts. */
const REMOVE_ANIMATION_MS = 180;

/**
 * Swipe-left-to-delete for a cart line — the same list still keeps its
 * trash-icon button too; this is an additional way in, not a replacement.
 *
 * Axis-locks on the first ~8px of movement so a vertical scroll through
 * the cart list is never mistaken for a delete swipe — only a gesture
 * that starts out clearly more horizontal than vertical claims the touch
 * (calls preventDefault/stopPropagation) at all.
 *
 * Listeners are attached via a callback ref + native addEventListener,
 * not JSX onTouchMove — React registers JSX-bound touchmove handlers as
 * passive by default, which silently makes preventDefault() inside them
 * a no-op. Same reasoning as use-drag-to-close.ts, which this component
 * predates but should have matched from the start.
 */
export function SwipeableCartLine({
  onDelete,
  children,
}: {
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"x" | "y" | null>(null);
  // Always-current mirror of dragX for the threshold check on release —
  // see the matching comment in use-drag-to-close.ts for why the state
  // value alone can be one event stale under React's render batching.
  const dragXRef = useRef(0);

  function reset() {
    dragXRef.current = 0;
    setDragX(0);
    setDragging(false);
    start.current = null;
    axis.current = null;
  }

  const cleanup = useRef<(() => void) | null>(null);
  // Kept current every render so the callback ref below can stay stable
  // (empty deps) instead of detaching/reattaching native listeners on
  // every keystroke-equivalent re-render of the cart.
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  const rowRef = useCallback((el: HTMLDivElement | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0]!;
      start.current = { x: t.clientX, y: t.clientY };
      axis.current = null;
      setDragging(true);
    }

    function onTouchMove(e: TouchEvent) {
      if (!start.current) return;
      const t = e.touches[0]!;
      const dx = t.clientX - start.current.x;
      const dy = t.clientY - start.current.y;

      if (!axis.current) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // not enough movement to tell yet
        axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (axis.current === "y") return; // vertical scroll — leave it to the list

      // Claimed as a horizontal delete-swipe — stop it here so it
      // doesn't also reach the cart drawer's own vertical
      // swipe-down-to-close handler on the list container around this
      // row, and so the browser never reads it as a page scroll/bounce.
      e.stopPropagation();
      e.preventDefault();
      const next = Math.min(0, dx); // left only
      dragXRef.current = next;
      setDragX(next);
    }

    function onTouchEnd() {
      if (axis.current === "x" && dragXRef.current < -DELETE_THRESHOLD) {
        setDragX(-OFFSCREEN_PX);
        setDragging(false);
        window.setTimeout(() => onDeleteRef.current(), REMOVE_ANIMATION_MS);
        return;
      }
      reset();
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", reset);
    cleanup.current = () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", reset);
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="absolute inset-0 flex items-center justify-end bg-hg-red px-5">
        <Trash2 className="h-5 w-5 text-white" />
      </div>
      <div
        ref={rowRef}
        style={{ transform: `translateX(${dragX}px)` }}
        className={cn(!dragging && "transition-transform duration-200 ease-out")}
      >
        {children}
      </div>
    </div>
  );
}
