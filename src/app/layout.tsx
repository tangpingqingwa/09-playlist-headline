import React, { type ReactNode } from "react";
import "./board.css";

export const metadata = {
  title: "Playlist Headline",
  description:
    "Bid USD. Open the week. Listeners hear you first. Rank is the bid. Playback is real.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=Newsreader:opsz,wght@6..72,500;6..72,650&family=Source+Sans+3:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <a className="logo" href="/">
              PH<span>09</span>
              <span className="logo-name">playlist.headline</span>
            </a>
            <nav className="site-nav" aria-label="Main">
              <ul>
                <li>
                  <a href="/">Leaderboard</a>
                </li>
                <li>
                  <a href="/about">About</a>
                </li>
                <li>
                  <a href="/rules">Rules</a>
                </li>
              </ul>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
