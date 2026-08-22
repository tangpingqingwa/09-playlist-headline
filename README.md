# Playlist Headline

Weekly public auction for the first track / opening song on a real playlist or live radio. Rank is the bid. Playback is real. No invented play counts.

Build contract: [SPEC.md](./SPEC.md).
How we build: [BUILD.md](./BUILD.md).
How we work: [CONTRIBUTING.md](./CONTRIBUTING.md). `main` stays buildable and testable.

Clone of [outbid.lol](https://outbid.lol/) mechanics: USD whole dollars, min $5, older wins ties, raise pays the difference, Polar + fixture.

```bash
bash scripts/test.sh
```

Offline until a later PR adds the app. Live Polar is never required to keep `main` green.
