# Playlist Headline

Public auction last 7 days for the first track / opening song on a real playlist or live radio. Rank lives in a rolling last-7-days window, not Monday 00:00 UTC. Rank is the bid. Playback is real. No invented play counts.

Build contract: [SPEC.md](./SPEC.md).
How we build: [BUILD.md](./BUILD.md).
How we work: [CONTRIBUTING.md](./CONTRIBUTING.md). `main` stays buildable and testable.

Clone of [outbid.lol](https://outbid.lol/) mechanics: USD whole dollars, min $5, older wins ties, raise pays the difference, Polar + fixture.

```bash
bash scripts/test.sh
```

`GET /healthz` returns `{ ok: true }`. Live Polar is never required to keep `main` green.
