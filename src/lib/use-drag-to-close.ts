"use client";

import { useRef, useState } from "react";

/**
 * Swipe-to-dismiss for a sheet/drawer, usable from two kinds of zones:
 *
 *   - `handlers` — a non-scrolling zone (a header, a photo). Any downward
 *     (or, for axis "x", rightward) drag is immediately claimed.
 *   - `contentHandlers(getScrollTop)` — a SCROLLABLE zone (the modifier
 *     list, the cart's item list). Only claims the gesture once the
 *     content is already scrolled to the top — otherwise it's a normal
 *     scroll and this backs off entirely (no preventDefault, no offset
 *     tracking) so scrolling is never interrupted. The moment a drag
 *     that started as a scroll reaches the top and keeps going, it picks
 *     up from there — not from the original touch point, or most of a
 *     long scroll's distance would count against the close threshold.
 *
 * `axis: "y"` is for a bottom sheet (drag DOWN to close — ProductDetailSheet,
 * ProductListSheet). `axis: "x"` is for a drawer that slides in from the
 * right (drag further RIGHT, off-screen, to close).
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
  const offsetRef = useRef(0);

  function clientPos(e: React.TouchEvent): number {
    return axis === "y" ? e.touches[0]!.clientY : e.touches[0]!.clientX;
  }

  function applyOffset(next: number) {
    const clamped = Math.max(0, next);
    offsetRef.current = clamped;
    setOffset(clamped);
  }

  function finish() {
    if (offsetRef.current > threshold) onClose();
    offsetRef.current = 0;
    setOffset(0);
    setDragging(false);
  }

  // ---- non-scrolling zone (header/photo) -----------------------------
  const start = useRef<number | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    start.current = clientPos(e);
    setDragging(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (start.current === null) return;
    applyOffset(clientPos(e) - start.current);
  }

  function onTouchEnd() {
    start.current = null;
    finish();
  }

  // ---- scrollable content zone ----------------------------------------
  // `tracking` flips true the moment the content is at scrollTop 0 and the
  // user keeps dragging in the closing direction — from then on this
  // gesture behaves exactly like the header's, just claimed partway
  // through instead of from touchstart.
  const contentStart = useRef<number | null>(null);
  const tracking = useRef(false);

  function contentHandlers(getScrollTop: () => number) {
    return {
      onTouchStart(e: React.TouchEvent) {
        contentStart.current = clientPos(e);
        tracking.current = false;
      },
      onTouchMove(e: React.TouchEvent) {
        if (contentStart.current === null) return;
        const pos = clientPos(e);

        if (!tracking.current) {
          if (getScrollTop() > 0) return; // still scrollable — leave it to the list
          tracking.current = true;
          contentStart.current = pos; // start measuring the close-drag from HERE
          setDragging(true);
        }

        const delta = pos - contentStart.current;
        if (delta <= 0) {
          // Dragging back toward/past the start while "at the top" — not
          // a close attempt (and there's nothing to scroll either way,
          // scrollTop's already 0). Just hold at 0 rather than let it go
          // negative.
          applyOffset(0);
          return;
        }
        e.preventDefault(); // claimed — don't also let the page rubber-band
        applyOffset(delta);
      },
      onTouchEnd() {
        contentStart.current = null;
        tracking.current = false;
        finish();
      },
      onTouchCancel() {
        contentStart.current = null;
        tracking.current = false;
        offsetRef.current = 0;
        setOffset(0);
        setDragging(false);
      },
    };
  }

  return {
    offset,
    dragging,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
    contentHandlers,
  };
}
