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
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <a className="logo" href="/">
              playlist<span>.</span>headline
            </a>
            <nav className="site-nav" aria-label="Main">
              <ul>
                <li>
                  <a href="/" aria-current="page">
                    Board
                  </a>
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
