"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type CategoryNavProps = {
  categories: Array<{ id: string; name: string }>;
};

/** Anchor id for a category section — shared with the section headings in menu-browser.tsx. */
export function categorySectionId(categoryId: string): string {
  return `category-${categoryId}`;
}

/**
 * Sticky horizontal tab bar. Tracks which category section is currently in
 * view (IntersectionObserver, not scroll math) and highlights + auto-scrolls
 * that tab into view — the same pattern as a Wolt/UberEats restaurant page.
 */
export function CategoryNav({ categories }: CategoryNavProps) {
  const [activeId, setActiveId] = useState(categories[0]?.id ?? "");
  const navRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  // Suppresses the observer's own reaction to the scroll a tab-click causes,
  // so clicking tab 3 doesn't get immediately overridden by tab 2 still
  // being 51% visible mid-scroll.
  const suppressObserver = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (suppressObserver.current) return;
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        // The topmost visible section wins.
        const top = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
        const id = top.target.getAttribute("data-category-id");
        if (id) setActiveId(id);
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: 0 },
    );

    for (const category of categories) {
      const el = document.getElementById(categorySectionId(category.id));
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [categories]);

  useEffect(() => {
    const tab = tabRefs.current.get(activeId);
    tab?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeId]);

  function handleTabClick(categoryId: string) {
    setActiveId(categoryId);
    suppressObserver.current = true;
    const el = document.getElementById(categorySectionId(categoryId));
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      suppressObserver.current = false;
    }, 700);
  }

  return (
    <div className="sticky top-0 z-20 border-b border-hg-brown/10 bg-hg-bg/95 backdrop-blur-sm">
      <div
        ref={navRef}
        className="scrollbar-none flex gap-1 overflow-x-auto px-3 py-2 sm:px-6"
      >
        {categories.map((category) => {
          const isActive = category.id === activeId;
          return (
            <button
              key={category.id}
              ref={(el) => {
                if (el) tabRefs.current.set(category.id, el);
                else tabRefs.current.delete(category.id);
              }}
              type="button"
              onClick={() => handleTabClick(category.id)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
                isActive ? "bg-hg-red text-white" : "text-hg-brown hover:bg-hg-cream/60",
              )}
            >
              {category.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
