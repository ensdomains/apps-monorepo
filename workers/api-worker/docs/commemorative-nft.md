# ENSv2 commemorative NFT backend

## Staging infrastructure

- R2 bucket: `ensv2-commemorative-nft-staging`
- Public origin:
  `https://pub-43406b099825402eb42ecfb3494a902b.r2.dev`
- Worker binding: `COMMEMORATIVE_NFT_BUCKET`
- Public access is read-only. CORS allows `GET` and `HEAD`; production must
  replace the wildcard origin with the final app origins.

Key layout:

- `eligibility/<lowercase-address>.json`
- `render-input/<decimal-token-id>.json`
- `tokens/<decimal-token-id>.json`
- `tokens/<decimal-token-id>.png`
- `tokens/<decimal-token-id>.mp4`
- `renderer/<version>/...`

The public `health.json` object verifies the bucket origin. The three-address
Sepolia fixture under `fixtures/` generates the deployed staging root
`0xdf3b19d887bceb97c681618cb29e9ae6fe540599eec7567ef24586d444c02260`.

The Yoginth fixture has a complete generated staging token at token ID
`46455108410614081663945406319915307572171076188378075311311703967581922008221`.
Its public objects were downloaded after upload and verified against the local
capture:

- PNG: 2,434,334 bytes, SHA-256
  `9e9681274c387be2f6d2dbcef79856ceb549555dca37b0e04b62e51b613e2248`
- MP4: 7,627,258 bytes, SHA-256
  `502e89b84ec670c80aa5cecf1190aab7ee826b89f9a483c7c84828532138667a`
- metadata: 662 bytes, SHA-256
  `43c97da7429a03b09328745fb8ef812622488d40a9c9043faeb8a827e90ff38d`

## Snapshot pipeline

The pipeline uses a streaming CSV parser and OpenZeppelin
`StandardMerkleTree`. It refuses conflicting duplicate rows and an unexpected
root.

```sh
pnpm nft:pipeline \
  --input snapshot-window-1.csv \
  --input snapshot-window-2.csv \
  --expected-root 0x203fbd8044e5acb7ef03508bb61cc0c8dfa4475ad178986471d2726db56f8c92
```

Add `--upload` only after setting bucket-scoped S3 credentials:

```sh
R2_ACCOUNT_ID=... \
R2_ACCESS_KEY_ID=... \
R2_SECRET_ACCESS_KEY=... \
R2_BUCKET_NAME=ensv2-commemorative-nft-staging \
pnpm nft:pipeline --input snapshot.csv --upload
```

Do not paste the secret access key into issues, chat, or committed env files.

## Token serving and generation

`GET /v1/commemorative-nft/<tokenId>.(json|png|mp4)` serves immutable objects
from R2. On a miss it submits an idempotent job to the authenticated generator
service and returns `503` with `Retry-After` until media is ready.

The generator is a separate container under
`workers/commemorative-nft-generator`. It runs the renderer in headless
Chromium/SwiftShader, persists PNG and MP4 first, and publishes metadata last.
The PNG is captured at renderer frame zero. The pinned Chromium MP4 output is
canonicalized to remove container timestamps and its unregistered SEI
wall-clock payload. Two independent 600-frame renderer captures produced the
same canonical MP4 hash above. The API Worker cannot perform this
WebGL/WebCodecs workload itself.

Production activation still requires:

- bucket-scoped R2 write credentials in the deployment secret manager;
- a deployed generator container and Worker generator URL/token;
- the frozen, hardened renderer bundle from WEB-604;
- a permanent custom R2 domain;
- the reviewed mainnet contract and base URI.
