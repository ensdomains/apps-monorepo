# Commemorative NFT generator

Container runtime for WEB-603 and WEB-607. Cloudflare Workflows owns durable
job state and calls this service synchronously; this process intentionally has
no in-memory job queue.

For each token, the generator:

1. Reads and validates `render-input/<tokenId>.json` from staging R2.
2. Opens the pinned renderer in Chromium with WebGL through SwiftShader.
3. Captures PNG and H.264 MP4 through `ens.faceCapture`.
4. Canonicalizes Chromium timestamp-bearing MP4 fields.
5. Writes PNG and MP4 with SHA-256 metadata.
6. Writes ERC-721 metadata only after both media objects are present.
7. Re-reads all three objects and returns their hashes and byte sizes.

The API is reachable only through the Cloudflare Container Durable Object
binding. A bearer token is still required as defense in depth.

## Environment

Required:

- `GENERATOR_AUTH_TOKEN`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_ORIGIN`
- `NFT_PUBLIC_ASSET_ORIGIN`
- `RENDERER_REVISION`

Optional staging defaults:

- `R2_BUCKET_NAME=ensv2-commemorative-nft-staging`
- `RENDERER_ORIGIN=https://ens-renderer.pages.dev`
- `PORT=3000`
- `CAPTURE_TIMEOUT_MS=600000`
- `CHROMIUM_EXECUTABLE_PATH=/path/to/chromium`
- `NFT_EXTERNAL_ORIGIN=https://app.ens.dev/migration/nft`

R2 credentials must be scoped to the staging bucket and supplied through
Cloudflare Worker secrets. They must never be exposed to Manager or committed.

## Browser Run capability spike

`pnpm capability:browser-run` connects to Cloudflare Browser Run through CDP,
captures the same public render input twice, validates WebGL/PNG/H.264 MP4,
canonicalizes the MP4s, and compares both hashes. It prints
`selectedAdapter: "browser-run"` only when every requirement passes; all
failures select `"container"`.

Required for the spike:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `BROWSER_RUN_RENDER_INPUT_URL`
- `BROWSER_RUN_TOKEN_ID`
- `RENDERER_REVISION`

The staging Worker is configured for the container adapter until a recorded
Browser Run report passes this test.
