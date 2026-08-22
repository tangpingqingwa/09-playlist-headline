/** Real playback only: stored listen URL or a documented official embed. */

export type Playback =
  | { kind: "empty" }
  | { kind: "redirect"; listenUrl: string }
  | { kind: "embed"; listenUrl: string; embedUrl: string };

const GENERATED_AUDIO = /(?:^|\/)(?:generated|fake|silent|placeholder)[^/]*\.(?:mp3|wav|ogg|m4a)$/i;

export function listenClickPath(listingId: string): string {
  return `/click/${listingId}`;
}

export function isGeneratedAudioUrl(listenUrl: string): boolean {
  try {
    const parsed = new URL(listenUrl);
    if (parsed.protocol === "blob:" || parsed.protocol === "data:") return true;
    return GENERATED_AUDIO.test(parsed.pathname);
  } catch {
    return true;
  }
}

/** Official host embeds only. Unknown https destinations 302 to the stored URL. */
export function officialEmbedUrl(listenUrl: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(listenUrl);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:") return undefined;

  const host = parsed.hostname.toLowerCase();
  const youtubeId = youtubeVideoId(host, parsed);
  if (youtubeId) {
    return `https://www.youtube.com/embed/${youtubeId}`;
  }

  const spotify = spotifyEmbedPath(host, parsed.pathname);
  if (spotify) {
    return `https://open.spotify.com/embed/${spotify}`;
  }

  if (host === "soundcloud.com" || host.endsWith(".soundcloud.com")) {
    const encoded = encodeURIComponent(`https://soundcloud.com${parsed.pathname}`);
    return `https://w.soundcloud.com/player/?url=${encoded}`;
  }

  return undefined;
}

function youtubeVideoId(host: string, parsed: URL): string | undefined {
  const id = parsed.searchParams.get("v");
  if (
    (host === "youtube.com" ||
      host === "www.youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com") &&
    id &&
    /^[\w-]{11}$/.test(id)
  ) {
    return id;
  }
  if (host === "youtu.be") {
    const short = parsed.pathname.replace(/^\/+/, "").split("/")[0];
    if (short && /^[\w-]{11}$/.test(short)) return short;
  }
  return undefined;
}

function spotifyEmbedPath(host: string, pathname: string): string | undefined {
  if (host !== "open.spotify.com") return undefined;
  const match = pathname.match(/^\/(track|album|playlist|episode|show)\/([A-Za-z0-9]+)\/?$/);
  if (!match) return undefined;
  return `${match[1]}/${match[2]}`;
}

export function assertRealPlayback(listenUrl: string): string {
  if (isGeneratedAudioUrl(listenUrl)) {
    throw new Error("fake stream");
  }
  const parsed = new URL(listenUrl);
  if (parsed.protocol !== "https:") {
    throw new Error("fake stream");
  }
  return listenUrl;
}

/** Empty week has no player and no opening song. Do not invent a stream. */
export function playbackForListing(
  listing: { listenUrl: string } | undefined,
): Playback {
  if (!listing) {
    return { kind: "empty" };
  }
  const listenUrl = assertRealPlayback(listing.listenUrl);
  const embedUrl = officialEmbedUrl(listenUrl);
  if (embedUrl) {
    return { kind: "embed", listenUrl, embedUrl };
  }
  return { kind: "redirect", listenUrl };
}
