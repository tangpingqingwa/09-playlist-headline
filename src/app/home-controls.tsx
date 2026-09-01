"use client";

import React, { useEffect, useId, useRef, useState } from "react";

export type CategoryOption = {
  slug: string;
  label: string;
  shortLabel: string;
};

/** Presentation-only music lanes; no lane is persisted on a Listing. */
export const CATEGORY_OPTIONS: readonly CategoryOption[] = [
  { slug: "ambient-field", label: "Ambient / Field", shortLabel: "Ambient" },
  { slug: "beats-electronic", label: "Beats / Electronic", shortLabel: "Beats" },
  { slug: "hip-hop-rnb", label: "Hip-Hop / R&B", shortLabel: "Hip-Hop" },
  { slug: "indie-alternative", label: "Indie / Alternative", shortLabel: "Indie" },
  { slug: "pop-dance", label: "Pop / Dance", shortLabel: "Pop" },
  { slug: "rock-punk", label: "Rock / Punk", shortLabel: "Rock" },
  { slug: "jazz-soul", label: "Jazz / Soul", shortLabel: "Jazz" },
  { slug: "classical-score", label: "Classical / Score", shortLabel: "Classical" },
  { slug: "folk-global", label: "Folk / Global", shortLabel: "Global" },
  { slug: "spoken-experimental", label: "Spoken / Experimental", shortLabel: "Spoken" },
];

type Period = "all-time" | "today";

export type SearchListing = {
  id: string;
  track: string;
  artist: string;
  host: string;
  rank: string;
  href: string;
};

/** Match only the paid listing snapshot emitted by the current board. */
export function matchSearchListings(
  listings: readonly SearchListing[],
  query: string,
): SearchListing[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return listings.slice();
  return listings.filter((listing) => {
    const haystack = [
      listing.id,
      listing.track,
      listing.artist,
      listing.host,
      listing.rank,
    ]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/** Read only real paid card links already rendered for this page. */
export function readSearchListings(root?: ParentNode): SearchListing[] {
  const scope = root ?? (typeof document === "undefined" ? null : document);
  if (!scope) return [];
  const seen = new Set<string>();
  return Array.from(scope.querySelectorAll<HTMLElement>("[data-searchable-listing]"))
    .map((element) => ({
      id: element.dataset.listingId ?? "",
      track: element.dataset.searchTrack ?? "",
      artist: element.dataset.searchArtist ?? "",
      host: element.dataset.searchHost ?? "",
      rank: element.dataset.searchRank ?? "",
      href: element.getAttribute("href") ?? "",
    }))
    .filter((listing) => {
      if (
        !listing.id ||
        !listing.href.startsWith("/click/") ||
        (!listing.track && !listing.artist && !listing.host)
      ) {
        return false;
      }
      if (seen.has(listing.id)) return false;
      seen.add(listing.id);
      return true;
    });
}

export function periodFromSearch(search: string): Period {
  return new URLSearchParams(search).get("period") === "today"
    ? "today"
    : "all-time";
}

type ThemeDocument = Pick<Document, "documentElement" | "body">;

/** Apply both classes so the theme remains observable to the document and CSS. */
export function applyThemeToDocument(
  dark: boolean,
  target: ThemeDocument = document,
): void {
  target.documentElement.classList.toggle("dark", dark);
  target.body.classList.toggle("dark", dark);
  target.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function PeriodTabs({
  className = "",
  initialPeriod = "all-time",
}: {
  className?: string;
  initialPeriod?: Period;
}) {
  const [period, setPeriod] = useState<Period>(initialPeriod);

  useEffect(() => {
    const syncFromUrl = () => setPeriod(periodFromSearch(window.location.search));
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  return (
    <form
      className={`period-tabs ${className}`.trim()}
      data-slot="period-tabs"
      role="tablist"
      aria-label="Ranking period"
      data-ranking-period={period}
      data-period-scope={period === "today" ? "rolling-24-hours" : "rolling-week"}
      method="get"
      action="/"
    >
      <button
        type="submit"
        role="tab"
        aria-selected={period === "all-time"}
        aria-pressed={period === "all-time"}
        data-period="all-time"
        onClick={() => setPeriod("all-time")}
        name="period"
        value="all-time"
      >
        All-time
      </button>
      <button
        type="submit"
        role="tab"
        aria-selected={period === "today"}
        aria-pressed={period === "today"}
        data-period="today"
        onClick={() => setPeriod("today")}
        name="period"
        value="today"
      >
        Today
      </button>
    </form>
  );
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    let storedDark = false;
    try {
      storedDark = window.localStorage.getItem("playlist-headline-theme") === "dark";
    } catch {
      storedDark = false;
    }
    setDark(storedDark);
    applyThemeToDocument(storedDark);
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    applyThemeToDocument(next);
    try {
      window.localStorage.setItem("playlist-headline-theme", next ? "dark" : "light");
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
  }

  return (
    <button
      type="button"
      className="header-control theme-toggle"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={dark}
      data-theme-toggle=""
      data-theme-state={dark ? "dark" : "light"}
      onClick={toggleTheme}
    >
      Theme
    </button>
  );
}

export function SearchToggle() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [listings, setListings] = useState<SearchListing[]>([]);
  const inputId = useId();
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function closeSearch(focusTrigger = true) {
    setOpen(false);
    setQuery("");
    if (focusTrigger) {
      if (typeof window !== "undefined" && "requestAnimationFrame" in window) {
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      } else {
        triggerRef.current?.focus();
      }
    }
  }

  function focusListing(id: string) {
    const source = Array.from(
      document.querySelectorAll<HTMLElement>("[data-searchable-listing]"),
    ).find((element) => element.dataset.listingId === id);
    if (source) source.focus();
    else triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    setListings(readSearchListings());
    inputRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeSearch();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const results = query.trim()
    ? matchSearchListings(listings, query)
    : listings.slice(0, 5);
  const resultLabel = listings.length === 0
    ? "No paid placements on this view."
    : query.trim()
      ? `${results.length} matching paid placement${results.length === 1 ? "" : "s"}`
      : "Paid placements on this view";

  return (
    <div className="search-control" ref={rootRef} data-slot="search-control">
      <button
        ref={triggerRef}
        type="button"
        className="header-control search-toggle"
        aria-label="Search the board"
        aria-expanded={open}
        aria-controls={popoverId}
        data-search-toggle=""
        onClick={() => (open ? closeSearch() : setOpen(true))}
      >
        Search
      </button>
      {open ? (
        <div
          className="search-popover"
          id={popoverId}
          role="dialog"
          aria-label="Search paid placements"
        >
          <div className="search-popover-head">
            <span className="search-popover-label">Paid placements</span>
            <button
              type="button"
              className="search-close"
              aria-label="Close search"
              data-search-close=""
              onClick={() => closeSearch()}
            >
              Close
            </button>
          </div>
          <label className="search-input-label" htmlFor={inputId}>
            <span className="sr-only">Search tracks, artists, or hosts</span>
            <input
              ref={inputRef}
              id={inputId}
              type="search"
              name="search"
              placeholder="Search tracks, artists, hosts"
              data-slot="search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <p className="search-result-status" aria-live="polite">{resultLabel}</p>
          {results.length > 0 ? (
            <ul className="search-results" data-search-results="">
              {results.map((listing) => (
                <li key={listing.id}>
                  <a
                    className="search-result"
                    href={listing.href}
                    target="_blank"
                    rel="noopener"
                    data-search-result=""
                    data-listing-id={listing.id}
                    onClick={() => {
                      closeSearch(false);
                      focusListing(listing.id);
                    }}
                  >
                    <span className="search-result-track">{listing.track}</span>
                    <span className="search-result-meta">
                      {listing.artist} / {listing.host} / Rank {listing.rank}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="search-empty" data-search-empty="">
              {query.trim() ? `No paid matches for "${query.trim()}".` : resultLabel}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function RailOption({
  option,
  active,
  onClick,
}: {
  option: CategoryOption;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rail-option${active ? " is-active" : ""}`}
      aria-pressed={active}
      data-category-option={option.slug}
      onClick={onClick}
    >
      <span className="rail-option-full">{option.label}</span>
      <span className="rail-option-short">{option.shortLabel}</span>
    </button>
  );
}

export function CategoryRail() {
  const [active, setActive] = useState("all");
  const [moreOpen, setMoreOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [moreOpen]);

  const visible = CATEGORY_OPTIONS.slice(0, 9);
  return (
    <nav
      id="categories"
      tabIndex={-1}
      className="category-rail"
      aria-label="Music program lanes"
      data-slot="category-rail"
      data-category-nav=""
    >
      <span className="category-rail-label">Program index</span>
      <div className="category-rail-scroll" data-slot="category-track">
        <button
          type="button"
          className={`rail-option rail-all${active === "all" ? " is-active" : ""}`}
          aria-pressed={active === "all"}
          data-category-option="all"
          data-slot="category-option"
          onClick={() => setActive("all")}
        >
          <span>All stations</span>
        </button>
        {visible.map((option) => (
          <RailOption
            key={option.slug}
            option={option}
            active={active === option.slug}
            onClick={() => setActive(option.slug)}
          />
        ))}
      </div>
      <div className="category-more-wrap" ref={menuRef}>
        <button
          type="button"
          className="category-more"
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          data-category-more=""
          data-slot="category-more"
          onClick={() => setMoreOpen((value) => !value)}
        >
          <span className="more-label-desktop">Explore</span>
          <span className="more-label-mobile">More</span>
        </button>
        {moreOpen ? (
          <div className="category-more-menu" role="menu" aria-label="All ranking categories">
            <p>All ranking categories</p>
            {CATEGORY_OPTIONS.map((option) => (
              <button
                type="button"
                role="menuitem"
                key={option.slug}
                onClick={() => {
                  setActive(option.slug);
                  setMoreOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </nav>
  );
}
