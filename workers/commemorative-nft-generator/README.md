# Commemorative NFT generator

Container-only renderer service for WEB-607. It is deliberately separate from
the Cloudflare Worker because the renderer needs Chromium, WebGL, WebCodecs, and
H.264.

The service accepts an authenticated, idempotent
`POST /v1/tokens/<tokenId>/prepare`. It reads the renderer input from
`render-input/<tokenId>.json`, opens the configured renderer with that URL,
captures PNG and MP4 downloads, writes both media objects, then writes
`tokens/<tokenId>.json` last.

The capture freezes the renderer at frame zero for the PNG. MP4 generation uses
the renderer's 600-frame loop, then canonicalizes the pinned Chromium output by
zeroing MP4 creation/modification timestamps and replacing Chromium's
wall-clock-bearing unregistered SEI payload with a fixed valid payload. The
canonicalizer fails closed if the expected browser fingerprint changes.

Required environment:

- `GENERATOR_AUTH_TOKEN`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_ORIGIN`

Optional staging defaults:

- `R2_BUCKET_NAME=ensv2-commemorative-nft-staging`
- `RENDERER_ORIGIN=https://ens-renderer.pages.dev`
- `NFT_PUBLIC_ASSET_ORIGIN=<R2_PUBLIC_ORIGIN>/tokens`
- `PORT=3000`
- `CAPTURE_TIMEOUT_MS=600000`
- `CHROMIUM_EXECUTABLE_PATH=/path/to/chromium` (local smoke tests only)

Production must pin `RENDERER_ORIGIN` to the frozen R2 bundle from WEB-604 and
run this image in a long-lived container/VM with the bucket-scoped credentials.
