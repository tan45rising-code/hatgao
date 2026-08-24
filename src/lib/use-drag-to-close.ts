"use client";

import { useCallback, useRef, useState } from "react";

const OFFSCREEN_PX = 1200; // comfortably past any real viewport dimension
const SETTLE_MS = 500; // matches the CSS sheets/drawer normally close on — see the "duration-500" classes alongside every `settling || !dragging` check

/** A slow, deliberate drag only closes once it's gone this deep — half
 * the screen, not a fixed pixel count, so it means the same thing on a
 * small phone and a large one. Computed fresh per render (a plain
 * `window.innerHeight`/`innerWidth` read, not a layout-forcing one) so it
 * tracks orientation changes without needing its own effect/listener. */
const DISTANCE_THRESHOLD_FRACTION = 0.5;
/** A fast flick closes with much less distance than that — but still
 * needs to have moved at least this far, so a stray touchmove firing
 * right at touchstart (near-zero distance, so noisy velocity math) can
 * never read as a fling. */
const MIN_FLING_DISTANCE_PX = 32;
/** px/ms in the closing direction. ~800px/s — a real, deliberate flick,
 * not just a brisk drag (500px/s turned out to be common enough in an
 * ordinary swipe that it was undermining the whole point of raising the
 * distance threshold above). */
const FLING_VELOCITY_PX_PER_MS = 0.8;

/**
 * Swipe-to-dismiss for a sheet/drawer, usable from two kinds of zones:
 *
 *   - `headerRef` — attach to a non-scrolling zone (a header, a photo).
 *     Any downward (or, for axis "x", rightward) drag is claimed
 *     immediately.
 *   - `contentRef` — attach to a SCROLLABLE zone (the modifier list, the
 *     cart's item list). Only claims the gesture once the content is
 *     already scrolled to the top — otherwise it's a normal scroll and
 *     this backs off entirely so scrolling is never interrupted. The
 *     moment a drag that started as a scroll reaches the top and keeps
 *     going, it picks up from there — not from the original touch point,
 *     or most of a long scroll's distance would count against the close
 *     threshold. If the caller also needs this same element for
 *     something else (ProductDetailSheet resets its own scroll position
 *     on product swap), merge the two refs (see src/lib/utils.ts —
 *     mergeRefs) rather than only attaching one.
 *
 *     It's also fine to attach `contentRef` to a zone that never actually
 *     scrolls (CartDrawer's empty-cart state, which has no list to
 *     protect) — `scrollTop` on a non-scrolling element just reads 0
 *     forever, so it behaves like an immediate-claim zone, but still one
 *     that only closes on a genuine downward drag rather than eating
 *     every touch unconditionally.
 *
 * Both are plain callback refs, not spreadable JSX props, and both wire
 * up native `addEventListener(..., { passive: false })` calls instead of
 * JSX `onTouchMove` — that distinction matters: React registers
 * JSX-bound touchmove handlers as passive by default (a browser-
 * recommended default for scroll performance), which makes
 * `e.preventDefault()` inside them a silent no-op. That was the actual
 * cause of a swipe-to-close also triggering the page's native pull-to-
 * refresh — the call to preventDefault() was there, it just never took
 * effect. A manually-attached, explicitly non-passive listener is the
 * only way `preventDefault()` actually sticks.
 *
 * `axis: "y"` is for a bottom sheet (drag DOWN to close — ProductDetailSheet,
 * ProductListSheet, CartDrawer).
 *
 * Closing on release is distance-OR-velocity, not distance alone: a slow
 * drag has to go a genuine `threshold` px deep, but a fast flick — this is
 * what "swipe down hard and fast" actually measures, px moved per ms,
 * sampled continuously during the drag rather than derived from
 * start/end alone (which a pause-then-flick could fool) — closes off a
 * much shorter, `MIN_FLING_DISTANCE_PX` distance. Without the velocity
 * half, `threshold` alone was easy to cross by accident on any moderately
 * deliberate drag; without the distance floor, a single noisy touchmove
 * right at touchstart could read as an enormous, meaningless velocity.
 *
 * On release, `finish()` doesn't just snap back to 0 — it keeps
 * animating the SAME offset (with a transition now, since the finger's
 * gone) either back to 0 or on out to fully off-screen, and only
 * resets/calls onClose() once that settles. The alternative — resetting
 * immediately and handing off to a caller's own open/closed CSS class —
 * is what caused a visible diagonal jump on the cart drawer: its
 * closed-class transform is horizontal (it slides in from the right),
 * so a swipe-down-triggered close was snapping from "dragged down some
 * pixels" straight to "translateX(100%)", animating both axes across
 * two different transforms in one transition. Finishing the exit
 * entirely within this hook's own single-axis offset sidesteps that —
 * the caller's horizontal open/close classes are only ever exercised by
 * a non-drag close (the X button, the backdrop), untouched by this.
 *
 * The threshold check on release reads a ref, not the `offset` state
 * value — React batches state updates, so a fast flick can fire
 * touchmove-then-touchend before a re-render ever hands the handler a
 * closure with the latest offset, making the state value read there
 * potentially one event stale. The ref is always current. Same reasoning
 * covers the velocity ref.
 */
export function useDragToClose(axis: "x" | "y", onClose: () => void, thresholdOverride?: number) {
  // Half the screen, not a fixed pixel count — see DISTANCE_THRESHOLD_FRACTION.
  // `thresholdOverride` exists for a caller that genuinely wants a fixed
  // px value instead; nothing currently does.
  const threshold =
    thresholdOverride ??
    (typeof window === "undefined"
      ? 400
      : (axis === "y" ? window.innerHeight : window.innerWidth) * DISTANCE_THRESHOLD_FRACTION);

  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const offsetRef = useRef(0);

  // Velocity, in px/ms along the drag axis (positive = moving in the
  // closing direction), sampled on every touchmove that's actually being
  // treated as a close-drag. Shared between the header and content zones
  // — a given touch only ever engages one of them, so one tracker is
  // enough.
  const lastSample = useRef<{ pos: number; time: number } | null>(null);
  const velocityRef = useRef(0);

  function clientPos(e: TouchEvent): number {
    return axis === "y" ? e.touches[0]!.clientY : e.touches[0]!.clientX;
  }

  function recordVelocitySample(pos: number) {
    const now = performance.now();
    const prev = lastSample.current;
    if (prev) {
      const dt = now - prev.time;
      // A zero (or negative, across some platforms' timer quirks) dt
      // sample is a duplicate/coalesced event, not real motion — skip it
      // rather than dividing by ~0 and reading a spurious huge velocity.
      if (dt > 0) velocityRef.current = (pos - prev.pos) / dt;
    }
    lastSample.current = { pos, time: now };
  }

  function resetVelocity() {
    lastSample.current = null;
    velocityRef.current = 0;
  }

  function applyOffset(next: number) {
    const clamped = Math.max(0, next);
    // Skip the state update once we're already resting at 0 — this
    // matters, not just as a micro-optimization: once a scrollable
    // content zone has been "claimed" (tracking.current below), every
    // remaining touchmove of a long scroll gesture — even one headed
    // further INTO the list, which this hook has nothing to do with —
    // was still calling this on every single event, forcing a re-render
    // of the whole sheet/drawer dozens of times a second. That's what
    // made a fast swipe through "Often bought with"/"Recommended for
    // you" look like it was stuttering/snapping instead of scrolling
    // smoothly — not the scroll itself, which the browser handles
    // natively, but this hook uselessly re-rendering alongside it.
    if (clamped === 0 && offsetRef.current === 0) return;
    offsetRef.current = clamped;
    setOffset(clamped);
  }

  function finish() {
    const distance = offsetRef.current;
    const closing =
      distance > threshold || (distance > MIN_FLING_DISTANCE_PX && velocityRef.current > FLING_VELOCITY_PX_PER_MS);
    const settleTo = closing ? OFFSCREEN_PX : 0;
    setSettling(true);
    offsetRef.current = settleTo;
    setOffset(settleTo);
    resetVelocity();
    if (closing) onClose();
    window.setTimeout(() => {
      setSettling(false);
      setDragging(false);
      offsetRef.current = 0;
      setOffset(0);
    }, SETTLE_MS);
  }

  function cancel() {
    setSettling(false);
    setDragging(false);
    offsetRef.current = 0;
    setOffset(0);
    resetVelocity();
  }

  // ---- header/photo zone -----------------------------------------------
  const headerCleanup = useRef<(() => void) | null>(null);
  const headerStart = useRef<number | null>(null);

  const headerRef = useCallback((el: HTMLElement | null) => {
    headerCleanup.current?.();
    headerCleanup.current = null;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      headerStart.current = clientPos(e);
      resetVelocity();
      setDragging(true);
    }
    function onTouchMove(e: TouchEvent) {
      if (headerStart.current === null) return;
      e.preventDefault();
      const pos = clientPos(e);
      recordVelocitySample(pos);
      applyOffset(pos - headerStart.current);
    }
    function onTouchEnd() {
      headerStart.current = null;
      finish();
    }
    function onTouchCancelNative() {
      headerStart.current = null;
      cancel();
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchCancelNative);
    headerCleanup.current = () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancelNative);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable callback ref by design; internals close over refs/state-setters, both stable
  }, []);

  // ---- scrollable content zone ------------------------------------------
  // `tracking` flips true the moment the content is at scrollTop 0 and the
  // user keeps dragging in the closing direction — from then on this
  // gesture behaves exactly like the header's, just claimed partway
  // through instead of from touchstart.
  const contentCleanup = useRef<(() => void) | null>(null);
  const contentStart = useRef<number | null>(null);
  const tracking = useRef(false);

  const contentRef = useCallback((el: HTMLElement | null) => {
    contentCleanup.current?.();
    contentCleanup.current = null;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      contentStart.current = clientPos(e);
      tracking.current = false;
      resetVelocity();
    }
    function onTouchMove(e: TouchEvent) {
      if (contentStart.current === null) return;
      const pos = clientPos(e);

      if (!tracking.current) {
        if (el!.scrollTop > 0) return; // still scrollable — leave it to the list
        tracking.current = true;
        contentStart.current = pos; // start measuring the close-drag from HERE
        setDragging(true);
      }

      const delta = pos - contentStart.current;
      if (delta <= 0) {
        // Dragging back toward/past the start while "at the top" — not a
        // close attempt (and there's nothing to scroll either way,
        // scrollTop's already 0). Just hold at 0 rather than let it go
        // negative. applyOffset already no-ops once settled at 0, so this
        // doesn't re-render on every event of a long scroll.
        applyOffset(0);
        return;
      }
      recordVelocitySample(pos);
      e.preventDefault(); // claimed — don't also let the page rubber-band/refresh
      applyOffset(delta);
    }
    function onTouchEnd() {
      contentStart.current = null;
      tracking.current = false;
      finish();
    }
    function onTouchCancelNative() {
      contentStart.current = null;
      tracking.current = false;
      cancel();
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchCancelNative);
    contentCleanup.current = () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancelNative);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable callback ref by design; internals close over refs/state-setters, both stable
  }, []);

  return { offset, dragging, settling, headerRef, contentRef };
}
