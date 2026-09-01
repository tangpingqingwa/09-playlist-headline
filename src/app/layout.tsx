import React, { type ReactNode } from "react";
import { SearchToggle, ThemeToggle } from "./home-controls";
import "./board.css";

export const metadata = {
  title: "Playlist Headline",
  description:
    "A rolling seven-day public auction for the first track on a real playlist or radio.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head />
      <body>
        <header className="site-header" data-slot="site-header">
          <div className="site-header-inner" data-slot="shell">
            <a className="logo" href="/" aria-label="Playlist Headline home" data-slot="brand">
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
