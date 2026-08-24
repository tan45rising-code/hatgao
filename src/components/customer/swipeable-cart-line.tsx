"use client";

import { useCallback, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** A slow, deliberate swipe only deletes once it's gone this far left —
 * half the screen width, not a fixed pixel count, so it means the same
 * thing on a small phone and a large one. Same reasoning as
 * use-drag-to-close.ts's DISTANCE_THRESHOLD_FRACTION, which this mirrors;
 * read fresh in onTouchEnd rather than cached, so it tracks orientation
 * changes for free. */
const DELETE_DISTANCE_FRACTION = 0.5;
/** A fast flick deletes with much less distance than that — but still
 * needs to have moved at least this far first, so a stray touchmove right
 * at touchstart (near-zero distance, so noisy velocity math) can never
 * read as a fling. Same reasoning as use-drag-to-close.ts, which this
 * mirrors. */
const MIN_FLING_DISTANCE_PX = 32;
/** px/ms, leftward. ~800px/s — a real, deliberate flick, not just a
 * brisk swipe (500px/s turned out to be common enough in an ordinary
 * swipe that it was undermining the whole point of raising the distance
 * threshold above). */
const FLING_VELOCITY_PX_PER_MS = 0.8;
const OFFSCREEN_PX = 400;
/** Fires a little before the "duration-500" slide-away transition below
 * actually finishes — the row is already essentially off-screen by then,
 * and waiting the full duration just makes the actual removal feel laggy
 * rather than adding anything visible. */
const REMOVE_ANIMATION_MS = 430;

/**
 * Swipe-left-to-delete for a cart line — the same list still keeps its
 * trash-icon button too; this is an additional way in, not a replacement.
 *
 * Axis-locks on the first ~8px of movement so a vertical scroll through
 * the cart list is never mistaken for a delete swipe — only a gesture
 * that starts out clearly more horizontal than vertical claims the touch
 * (calls preventDefault/stopPropagation) at all.
 *
 * Deleting on release is distance-OR-velocity, not distance alone — same
 * reasoning as use-drag-to-close.ts's `finish()`: a slow drag has to go a
 * genuine `DELETE_DISTANCE_FRACTION` of the screen deep, but a fast flick
 * closes off a much shorter distance, measured as real px/ms sampled continuously
 * during the drag rather than derived from start/end alone. Without the
 * velocity half, the threshold alone was easy to cross by accident on any
 * moderately deliberate swipe; without the distance floor, a single noisy
 * touchmove right at touchstart could read as an enormous, meaningless
 * velocity.
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
  // px/ms, positive = moving left (toward delete) — sampled on every
  // touchmove once the gesture's claimed as horizontal. Same reasoning as
  // use-drag-to-close.ts's velocityRef.
  const lastSample = useRef<{ x: number; time: number } | null>(null);
  const velocityRef = useRef(0);

  function resetVelocity() {
    lastSample.current = null;
    velocityRef.current = 0;
  }

  function reset() {
    dragXRef.current = 0;
    setDragX(0);
    setDragging(false);
    start.current = null;
    axis.current = null;
    resetVelocity();
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
      resetVelocity();
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

      const now = performance.now();
      const prev = lastSample.current;
      if (prev) {
        const dt = now - prev.time;
        // A zero/negative dt sample is a duplicate/coalesced event, not
        // real motion — skip it rather than dividing by ~0.
        if (dt > 0) velocityRef.current = -(t.clientX - prev.x) / dt;
      }
      lastSample.current = { x: t.clientX, time: now };

      const next = Math.min(0, dx); // left only
      dragXRef.current = next;
      setDragX(next);
    }

    function onTouchEnd() {
      const distance = -dragXRef.current; // positive px moved left
      const deleteThreshold = window.innerWidth * DELETE_DISTANCE_FRACTION;
      const deleting =
        axis.current === "x" &&
        (distance > deleteThreshold ||
          (distance > MIN_FLING_DISTANCE_PX && velocityRef.current > FLING_VELOCITY_PX_PER_MS));
      if (deleting) {
        setDragX(-OFFSCREEN_PX);
        setDragging(false);
        resetVelocity();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable callback ref by design; internals close over refs/state-setters, both stable (same pattern as use-drag-to-close.ts)
  }, []);

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="absolute inset-0 flex items-center justify-end bg-hg-red px-5">
        <Trash2 className="h-5 w-5 text-white" />
      </div>
      <div
        ref={rowRef}
        style={{ transform: `translateX(${dragX}px)` }}
        className={cn(!dragging && "transition-transform duration-500 ease-out")}
      >
        {children}
      </div>
    </div>
  );
}
