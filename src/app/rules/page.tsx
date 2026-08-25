import React from "react";

export const metadata = {
  title: "Rules · Playlist Headline",
  description:
    "Min $5. Older wins ties. Raise pays the difference. Weekly UTC reset. No fake streams. No invented play counts.",
};

export default function RulesPage() {
  return (
    <main className="doc-page" data-page="rules">
      <h1>Rules</h1>
      <p>
        These rules are the product. A bidder can predict rank from this page
        alone. Rank is the bid. Playback must be real.
      </p>

      <h2>Ranking</h2>
      <table>
        <tbody>
          <tr>
            <th>Rank is the bid</th>
            <td>
              Sort by <code>bidUsd</code> descending. Nothing else — no recency
              boost, no editorial pick, no play-count score.
            </td>
          </tr>
          <tr>
            <th>Whole dollars</th>
            <td>USD only. Integers. No cents. Step is $1.</td>
          </tr>
          <tr>
            <th>Minimum</th>
            <td>
              First bid for a listing this week must be <strong>$5</strong>.
            </td>
          </tr>
          <tr>
            <th>Below #1 still lists</th>
            <td>
              Paying less than the opening song still appears at the rank that
              bid can take. Those tracks are not the opening song.
            </td>
          </tr>
          <tr>
            <th>Equal bids</th>
            <td>
              <strong>Older wins ties.</strong> Compare{" "}
              <code>firstPaidAt</code> ascending, then listing id.
            </td>
          </tr>
          <tr>
            <th>Raise</th>
            <td>
              Same canonical listen URL still live in the rolling last 7 days
              raises.{" "}
              <strong>Raise pays difference</strong> only (
              <code>new − current</code>). New amount must be a whole dollar ≥
              current + $1.
            </td>
          </tr>
          <tr>
            <th>Cannot steal the difference</th>
            <td>
              A different listing that wants that rank must pay the{" "}
              <strong>full</strong> target amount, not the incumbent’s
              difference.
            </td>
          </tr>
          <tr>
            <th>Payment claims rank</th>
            <td>
              A completed payment claims the rank. Unpaid checkout does not.
              We do not invent a paid opening track.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Weekly UTC reset</h2>
      <table>
        <tbody>
          <tr>
            <th>Period</th>
            <td>
              Rolling last 7 days from first paid placement. Live rank is that
              window only.
            </td>
          </tr>
          <tr>
            <th>Boundary</th>
            <td>
              <strong>Rolling last 7 days. Not Monday 00:00 UTC.</strong> A
              listener outside civil midnight does not lose the opening song on
              a timezone tax. Not a 24h lock on #1.{" "}
              <code>weekId</code> stays an ISO week label (
              <code>YYYY-Www</code>, Monday 00:00:00.000 UTC) for Polar/audit.
            </td>
          </tr>
          <tr>
            <th>
              <code>weekId</code>
            </th>
            <td>
              ISO week in UTC, <code>YYYY-Www</code> (e.g. <code>2026-W34</code>
              ). Label only — not the live expiry.
            </td>
          </tr>
          <tr>
            <th>What resets</th>
            <td>
              Live rank after seven days from first paid placement. Clicks and
              bids do not carry once that window ends.
            </td>
          </tr>
          <tr>
            <th>What does not carry</th>
            <td>
              Previous window bid amounts. Want the next open? Pay again.
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        An empty week is valid. There is no opening song until someone pays. The
        empty open is last 7 days from a paid claim, not Monday 00:00 UTC. Do
        not invent a track.
      </p>

      <h2>Real playback</h2>
      <ul>
        <li>
          The listen URL is a real <code>https</code> page or stream (Spotify,
          Apple Music, YouTube / YouTube Music, SoundCloud, Bandcamp, Mixcloud,
          an official radio stream, or the artist’s own site).
        </li>
        <li>
          Listen 302s to the stored URL or embeds it through a documented
          official player for that host. Both are real playback.
        </li>
        <li>
          <strong>No fake streams.</strong> A silent custom player that does not
          load the listing’s URL is forbidden. We never generate or loop audio
          to fill the slot.
        </li>
        <li>
          If the week has no paid #1, there is no player and no opening song.
        </li>
      </ul>

      <h2>No invented play counts</h2>
      <p>
        We never display a play count, stream count, monthly listeners, or view
        count from any platform. Submitting those fields is{" "}
        <code>play_count_forbidden</code>. Public <strong>clicks</strong> on{" "}
        <code>GET /click/:id</code> are the only counter. Clicks are not plays.
      </p>

      <h2>Listen URL hygiene</h2>
      <ol>
        <li>
          Require <code>https:</code>. <code>http:</code> is{" "}
          <code>url_insecure</code>.
        </li>
        <li>
          Strip tracking and affiliate query keys: <code>utm_*</code>,{" "}
          <code>fbclid</code>, <code>gclid</code>, <code>gbraid</code>,{" "}
          <code>wbraid</code>, <code>msclkid</code>, <code>ref</code>,{" "}
          <code>ref_</code>, <code>affiliate</code>, <code>aff</code>,{" "}
          <code>irclickid</code>, <code>mc_cid</code>, <code>mc_eid</code>,{" "}
          <code>icid</code>, <code>si</code>, <code>igshid</code>.
        </li>
        <li>Strip fragments. Store and click only the stripped URL.</li>
        <li>
          Reject chat / invite hosts: Telegram, <code>t.me</code>,{" "}
          <code>wa.me</code>, chat.whatsapp, <code>discord.gg</code>, Discord
          invite, <code>m.me</code>, <code>signal.me</code>.
        </li>
        <li>
          Reject <strong>NSFW</strong> path tokens and adult hosts. Reject{" "}
          <code>javascript:</code>, <code>data:</code>, credentials-in-URL, and
          localhost / link-local hosts.
        </li>
        <li>
          Known shorteners (<code>bit.ly</code>, <code>t.co</code>,{" "}
          <code>tinyurl.com</code>, <code>lnkd.in</code>) are not stored.
        </li>
      </ol>
      <p>
        Chat / invite and NSFW fail as <code>url_forbidden</code>. No listing.
        No charge.
      </p>
    </main>
  );
}
