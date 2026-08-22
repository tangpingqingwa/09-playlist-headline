import React from "react";

export const metadata = {
  title: "About · Playlist Headline",
  description:
    "Weekly public auction for the opening song. Rank is the bid. Playback is real. No invented play counts.",
};

export default function AboutPage() {
  return (
    <main className="doc-page" data-page="about">
      <h1>About</h1>
      <p>
        Playlist Headline is a weekly public auction for the{" "}
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
        <strong>Playback is real.</strong> The listen URL is a real https
        destination the bidder controls. We 302 to that stored URL or embed it
        through a documented official player. There are{" "}
        <strong>no fake streams</strong> and no generated audio.
      </p>
      <p>
        There are <strong>no invented play counts</strong>. We do not scrape or
        display Spotify monthly listeners, YouTube views, SoundCloud plays, or
        any other platform stat. Public <strong>clicks</strong> on our listen hop
        are the only counter. Clicks are not plays.
      </p>
      <p>
        No ads, no API keys, no revenue share with listed tracks. Copy is{" "}
        <strong>English</strong>. Currency is <strong>USD</strong>. The market is{" "}
        <strong>global</strong> — there is no China-city default. This is the{" "}
        <strong>playlist-headline</strong> vertical, a clone of{" "}
        <a href="https://outbid.lol">outbid.lol</a> pay-to-rank mechanics.
      </p>
      <p>
        Anyone can read the board without an account. Payment is the only write
        path. Live money is Polar Checkout. Tests use a fixture so they never
        call live Polar. Abandoned checkout does not invent an opening track.
      </p>
      <p>
        <a href="/rules">Read the rules</a> for the $5 minimum, older-wins ties,
        raise-pays-difference, weekly UTC reset, and banned chat / NSFW URLs.
      </p>
    </main>
  );
}
