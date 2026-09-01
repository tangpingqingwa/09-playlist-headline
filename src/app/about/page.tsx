import React from "react";

export const metadata = {
  title: "About · Playlist Headline",
  description:
    "Public auction last 7 days for the opening song. Rank is the bid. Playback is real. No invented play counts.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <main className="doc-page" data-page="about">
      <h1>About</h1>
      <p>
        Playlist Headline is a public auction last 7 days for the{" "}
        <strong>first track / opening song</strong> on a real playlist or live
        radio. Artists, labels, and promoters bid whole US dollars so listeners
        hear their song first.
      </p>
      <p>
        <strong>Rank is the bid.</strong> Nothing else. Paying less than #1
        still lists at the rank that bid can take. Equal bids: the older listing
        keeps the higher rank.
      </p>
      <p>
        <strong>Playback is real.</strong> Every listing points to a secure
        destination controlled by the artist or rights holder and plays through
        an official destination or supported player. There are{" "}
        <strong>no fake streams</strong> and no generated audio.
      </p>
      <p>
        There are <strong>no invented play counts</strong>. We do not scrape or
        display Spotify monthly listeners, YouTube views, SoundCloud plays, or
        any other platform stat. Public <strong>clicks</strong> on our listen hop
        are the only counter. Clicks are not plays.
      </p>
      <p>
        The board is in <strong>English</strong>, bids use{" "}
        <strong>USD</strong>, and artists and listeners can participate from
        anywhere.
      </p>
      <p>
        Anyone can read the board without an account. A track appears only
        after payment is confirmed. A canceled or abandoned checkout never
        creates an opening track.
      </p>
      <p>
        <a href="/rules">Read the rules</a> for the $5 minimum, older-wins ties,
        raise-pays-difference, the seven-day placement window, and banned chat
        / NSFW URLs.
      </p>
    </main>
  );
}
