"use client";

import { useRef, useState } from "react";

/**
 * Swipe-to-dismiss for a sheet/drawer's non-scrolling chrome (header, drag
 * handle, photo) — never the scrollable content area, so a normal scroll
 * gesture inside a long list never fights with this.
 *
 * `axis: "y"` is for a bottom sheet (drag DOWN to close — ProductDetailSheet,
 * ProductListSheet); `axis: "x"` is for a drawer that slides in from the
 * right (CartDrawer — drag RIGHT, further off-screen, to close). Either
 * way only the closing direction is tracked; dragging the other way is
 * clamped to 0 rather than let the panel overshoot past fully-open.
 *
 * The threshold check on release reads a ref, not the `offset` state
 * value — React batches state updates, so a fast flick can fire
 * touchmove-then-touchend before a re-render ever hands onTouchEnd a
 * closure with the latest offset, making the state value read there
 * potentially one event stale. The ref is always current.
 */
export function useDragToClose(axis: "x" | "y", onClose: () => void, threshold = 80) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | null>(null);
  const offsetRef = useRef(0);

  function onTouchStart(e: React.TouchEvent) {
    start.current = axis === "y" ? e.touches[0]!.clientY : e.touches[0]!.clientX;
    setDragging(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (start.current === null) return;
    const current = axis === "y" ? e.touches[0]!.clientY : e.touches[0]!.clientX;
    const next = Math.max(0, current - start.current);
    offsetRef.current = next;
    setOffset(next);
  }

  function reset() {
    offsetRef.current = 0;
    setOffset(0);
    setDragging(false);
    start.current = null;
  }

  function onTouchEnd() {
    if (offsetRef.current > threshold) {
      onClose();
    }
    reset();
  }

  return {
    offset,
    dragging,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: reset },
  };
}
