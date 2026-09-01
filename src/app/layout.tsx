import React, { type ReactNode } from "react";
import { SearchToggle, ThemeToggle } from "./home-controls";
import "./board.css";

const SITE_URL = "https://playlistspot.lol";
const SITE_NAME = "Playlist Spot";
const SITE_DESCRIPTION =
  "Discover tracks bidding for the headline spot on a transparent rolling seven-day playlist board.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Playlist Spot — Headline Track Board", template: "%s | Playlist Spot" },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["playlist submission", "music promotion", "headline track", "independent music"],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/brand-mark.svg", type: "image/svg+xml" }],
    shortcut: "/brand-mark.svg",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "Playlist Spot — Headline Track Board",
    description: SITE_DESCRIPTION,
    images: [{ url: "/brand-mark.png", width: 512, height: 512, alt: "Playlist Spot record" }],
  },
  twitter: {
    card: "summary",
    title: "Playlist Spot — Headline Track Board",
    description: SITE_DESCRIPTION,
    images: ["/brand-mark.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  inLanguage: "en",
  isAccessibleForFree: true,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      </head>
      <body>
        <header className="site-header" data-slot="site-header">
          <div className="site-header-inner" data-slot="shell">
            <a className="logo" href="/" aria-label="Playlist Headline home" data-slot="brand">
              <img className="brand-mark" src="/brand-mark.svg" width="28" height="28" alt="" aria-hidden="true" />
              <span className="logo-name">playlist.headline</span>
            </a>
            <p className="header-station-call" aria-label="Station PH09">PH09 / ON AIR DESK</p>
            <nav className="site-nav" aria-label="Main" data-slot="primary-nav">
              <ul>
                <li className="nav-leaderboard">
                  <a href="/">Leaderboard</a>
                </li>
                <li>
                  <a
                    className="nav-button"
                    href="/?period=today"
                    data-period-nav="today"
                    aria-label="View today's paid placements"
                  >
                    Daily
                  </a>
                </li>
                <li>
                  <a
                    className="nav-button"
                    href="#categories"
                    data-category-nav-link=""
                  >
                    Categories
                  </a>
                </li>
                <li>
                  <a href="/about">About</a>
                </li>
                <li>
                  <a href="/rules">Rules</a>
                </li>
              </ul>
            </nav>
            <div className="header-actions">
              <SearchToggle />
              <ThemeToggle />
            </div>
          </div>
        </header>
        {children}
        <footer className="maker-footer" data-maker-contact="">
          <p>Built by <a href="mailto:tangpingqingwa@gmail.com">tangpingqingwa@gmail.com</a></p>
        </footer>
      </body>
    </html>
  );
}
