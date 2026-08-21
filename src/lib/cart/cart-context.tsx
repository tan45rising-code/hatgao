"use client";

/**
 * Client-only cart state. No server round-trip, no database row — Phase 2
 * is browse-and-build-a-cart only (see docs/ARCHITECTURE.md §J Phase 2).
 * Persisted to localStorage so a refresh or a tab close doesn't lose it;
 * that's the full extent of its durability. Nothing here survives a
 * cleared browser or transfers across devices, and it isn't meant to —
 * this becomes a real (server-backed) order only at Phase 3 checkout.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { buildLineId, EMPTY_CART, type Cart, type CartLine } from "./types";

const STORAGE_KEY = "hatgao-cart-v1";
const TOAST_DURATION_MS = 2200;

type AddToCartInput = Omit<CartLine, "lineId" | "quantity"> & { quantity: number };

type CartToast = { id: number; message: string };

type CartContextValue = {
  cart: Cart;
  addLine: (input: AddToCartInput) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  removeLine: (lineId: string) => void;
  updateNotes: (lineId: string, notes: string) => void;
  clear: () => void;
  /** UI state, not cart data — lives here (rather than as separate local
   * state in each component) so the header button, the bottom bar, and the
   * drawer itself can all open/close the one drawer without prop drilling. */
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  /** Set briefly by addLine, read by CartToast (cart-toast.tsx). Not the
   * drawer — adding an item shouldn't interrupt browsing (see the "don't
   * pop the drawer open on every add" fix), just a quiet confirmation. */
  toast: CartToast | null;
};

const CartContext = createContext<CartContextValue | null>(null);

function loadCart(): Cart {
  if (typeof window === "undefined") return EMPTY_CART;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_CART;
    const parsed = JSON.parse(raw) as Cart;
    if (!Array.isArray(parsed.lines)) return EMPTY_CART;
    return parsed;
  } catch {
    // Corrupt or foreign localStorage value — start fresh rather than crash.
    return EMPTY_CART;
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  // Starts empty on every render (server AND first client render) so
  // hydration always matches, then loads the real value from localStorage
  // right after mount — see the effect below.
  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [hydrated, setHydrated] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);

  const [toast, setToast] = useState<CartToast | null>(null);
  const toastSeq = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    setCart(loadCart());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return; // don't overwrite storage with the empty initial state
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart, hydrated]);

  const addLine = useCallback((input: AddToCartInput) => {
    const lineId = buildLineId(
      input.productId,
      input.modifiers.map((m) => m.modifierId),
    );
    setCart((prev) => {
      const existing = prev.lines.find((l) => l.lineId === lineId);
      if (existing) {
        return {
          lines: prev.lines.map((l) =>
            l.lineId === lineId ? { ...l, quantity: l.quantity + input.quantity } : l,
          ),
        };
      }
      return { lines: [...prev.lines, { ...input, lineId }] };
    });

    // Re-triggers even if a toast is already showing (new id, fresh
    // timer) — adding a second item while the first toast is still up
    // shows the new item's name and restarts the visible window, rather
    // than the message going stale.
    const id = ++toastSeq.current;
    setToast({ id, message: `${input.name} added to cart` });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, TOAST_DURATION_MS);
  }, []);

  const updateQuantity = useCallback((lineId: string, quantity: number) => {
    setCart((prev) => {
      if (quantity < 1) {
        return { lines: prev.lines.filter((l) => l.lineId !== lineId) };
      }
      return {
        lines: prev.lines.map((l) => (l.lineId === lineId ? { ...l, quantity } : l)),
      };
    });
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setCart((prev) => ({ lines: prev.lines.filter((l) => l.lineId !== lineId) }));
  }, []);

  const updateNotes = useCallback((lineId: string, notes: string) => {
    setCart((prev) => ({
      lines: prev.lines.map((l) => (l.lineId === lineId ? { ...l, notes } : l)),
    }));
  }, []);

  const clear = useCallback(() => setCart(EMPTY_CART), []);

  const value = useMemo(
    () => ({
      cart,
      addLine,
      updateQuantity,
      removeLine,
      updateNotes,
      clear,
      isDrawerOpen,
      openDrawer,
      closeDrawer,
      toast,
    }),
    [
      cart,
      addLine,
      updateQuantity,
      removeLine,
      updateNotes,
      clear,
      isDrawerOpen,
      openDrawer,
      closeDrawer,
      toast,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart() must be used within a CartProvider");
  return ctx;
}
