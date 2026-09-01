import React from "react";

export const metadata = {
  title: "Rules · Playlist Headline",
  description:
    "Min $5. Older wins ties. Raise pays the difference. Rolling last 7 days. No fake streams. No invented play counts.",
  alternates: { canonical: "/rules" },
};

export default function RulesPage() {
  return (
    <main className="doc-page" data-page="rules">
      <h1>Rules</h1>
      <p>
        The board follows the published rules below. There are no hidden
        ranking factors: rank is the bid, and playback must be real.
      </p>

      <h2>Ranking</h2>
      <table>
        <tbody>
          <tr>
            <th>Rank is the bid</th>
            <td>
              Tracks are ordered by bid from highest to lowest. Recency,
              editorial preference, and play counts do not affect rank.
            </td>
          </tr>
          <tr>
            <th>Whole dollars</th>
            <td>USD only. Integers. No cents. Step is $1.</td>
          </tr>
          <tr>
            <th>Minimum</th>
            <td>
              First bid for a listing last 7 days must be <strong>$5</strong>.
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
            <td>The track placed first keeps the higher rank.</td>
          </tr>
          <tr>
            <th>Raise</th>
            <td>
              The same cleaned listen link may raise while its placement is
              active. The original payer is charged only the{" "}
              <strong>difference</strong>, and the new total must be at least
              $1 higher.
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
              Rank changes only after payment is confirmed. An incomplete or
              abandoned checkout never appears on the board.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Rolling last 7 days</h2>
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
              Each placement keeps its own seven-day window. The board does not
              reset for everyone at Monday midnight and #1 is never locked for
              a fixed 24 hours.
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
        If nobody has paid for an active placement, there is no opening song.
      </p>

      <h2>Real playback</h2>
      <ul>
        <li>
          The listen link is a real, secure page or stream (Spotify,
          Apple Music, YouTube / YouTube Music, SoundCloud, Bandcamp, Mixcloud,
          an official radio stream, or the artist’s own site).
        </li>
        <li>
          Listen opens the cleaned destination or a supported official player.
          Both are real playback.
        </li>
        <li>
          <strong>No fake streams.</strong> A silent custom player that does not
          load the listing’s URL is forbidden. We never generate or loop audio
          to fill the slot.
        </li>
        <li>
          If last 7 days has no paid #1, there is no player and no opening song.
        </li>
      </ul>

      <h2>No invented play counts</h2>
      <p>
        We never display a play count, stream count, monthly listeners, or view
        count from any platform. Public <strong>clicks</strong> on the listen
        link are the only counter. Clicks are not plays.
      </p>

      <h2>Listen URL hygiene</h2>
      <ol>
        <li>Use a secure, public listen or stream link.</li>
        <li>Tracking, referral, and affiliate parameters are removed.</li>
        <li>Strip fragments. Store and click only the stripped URL.</li>
        <li>
          Reject chat / invite hosts: Telegram, <code>t.me</code>,{" "}
          <code>wa.me</code>, chat.whatsapp, <code>discord.gg</code>, Discord
          invite, <code>m.me</code>, <code>signal.me</code>.
        </li>
        <li>
          Adult content and private, local-only, credentialed, or otherwise
          unsafe destinations are rejected.
        </li>
        <li>
          Known shorteners (<code>bit.ly</code>, <code>t.co</code>,{" "}
          <code>tinyurl.com</code>, <code>lnkd.in</code>) are not stored.
        </li>
      </ol>
      <p>
        Rejected links never create a listing or start a charge.
      </p>
    </main>
  );
}
