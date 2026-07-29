# ENSv2 commemorative NFT staging backend

This package owns the public API and durable orchestration. Chromium/WebGL
capture runs in the separate `commemorative-nft-generator` workspace; the
Manager never receives R2 write credentials.

## Staging infrastructure

- R2 bucket: `ensv2-commemorative-nft-staging`
- Public R2 origin:
  `https://pub-43406b099825402eb42ecfb3494a902b.r2.dev`
- Public asset API:
  `https://app-api.ens.dev/v1/commemorative-nft`
- Renderer: `https://ens-renderer.pages.dev`
- Sepolia contract: `0xe49A9D706FCD82AA575496352B5633F80fBBC449`

The checked-in CORS policy is
`config/commemorative-nft-r2-cors.json`. It preserves the staging wildcard
read policy for `GET` and `HEAD`; production must narrow the allowed origins.
Changing the live bucket policy is a separate, explicit operator action.

The reviewed three-address fixture in
`fixtures/commemorative-nft-sepolia.csv` reproduces this deployed staging root:

```text
0xdf3b19d887bceb97c681618cb29e9ae6fe540599eec7567ef24586d444c02260
```

Existing fixture objects are immutable golden evidence. Capture experiments
must use a new controlled token or `spikes/<run-id>/...`; never overwrite or
delete those objects.

## Runtime flow

```text
confirmed Sepolia mint
  -> POST /v1/commemorative-nft/<tokenId>/prepare
  -> Workflow nft-11155111-<tokenId>-v1
  -> one of two standard-4 Container slots
  -> PNG + canonical H.264 MP4
  -> metadata JSON last
  -> re-read and SHA-256 verify all three objects
```

`GET|HEAD /v1/commemorative-nft/<tokenId>.(json|png|mp4)` serves complete
immutable objects. A known minted miss starts or resumes the same Workflow and
returns `503` with `Retry-After: 15`. Unknown or unminted assets return `404`;
the explicit prepare route returns `409` for a known unminted token. Starting,
resuming, or restarting generation consumes a token-scoped, one-hour KV
admission window; active workflows remain observable without consuming another
admission. Explicit preparation requests rejected by that boundary return
`429`.

Eligibility remains a direct R2 read and claimed status remains a direct
contract read. There are intentionally no eligibility, Merkle-proof, or mint
status API routes.

## Required Worker secrets

Set these through the Cloudflare secret manager before deploying:

- `COMMEMORATIVE_NFT_GENERATOR_AUTH_TOKEN`
- `COMMEMORATIVE_NFT_R2_ACCOUNT_ID`
- `COMMEMORATIVE_NFT_R2_ACCESS_KEY_ID`
- `COMMEMORATIVE_NFT_R2_SECRET_ACCESS_KEY`
- existing `SEPOLIA_RPC_URL`

The R2 key must have Object Read & Write access scoped only to
`ensv2-commemorative-nft-staging`. Do not commit, paste, or expose any value to
Manager.

## Browser Run capability gate

Before changing the deployed adapter, run the generator package's
`capability:browser-run` command with a controlled render input. It verifies
the pinned renderer bundle, WebGL, PNG, H.264 MP4, canonicalized repeat hashes,
and the overall ten-minute deadline across two captures.

A failed report selects `container`. Staging remains locked to the Container
adapter until a recorded Browser Run report returns `selectedAdapter:
"browser-run"` and a Browser Run runtime adapter is reviewed. Only one adapter
belongs in a deployed staging path.

## Publication and recovery guarantees

1. The Workflow validates a canonical decimal uint256 token and strict render
   input.
2. Capture retries three times with exponential backoff and a ten-minute
   attempt timeout.
3. Each Container accepts one Chromium capture; busy requests return `429` and
   are retried by the Workflow rather than queued in process.
4. R2 writes use five attempts, SHA-256 custom metadata, and
   `If-None-Match: *`.
5. PNG and MP4 are written before metadata.
6. Final verification downloads all three objects, recomputes their hashes,
   and checks content type, runtime adapter, and renderer revision.
7. Partial writes are safe to retry. Conflicting immutable objects fail
   without overwrite.

## Staging acceptance

Deployment and live acceptance are intentionally separate from source
implementation:

1. Confirm Workers Paid enables Workflows and Containers.
2. Confirm the existing R2 health, CORS, eligibility, and render-input objects.
3. Configure the four secrets above.
4. Build and deploy the Worker/Container.
5. Use an unclaimed controlled Sepolia fixture; do not reset an existing one.
6. Claim through Manager and verify prepare returns `202`.
7. Wait for Workflow completion, then validate PNG signature, H.264 MP4,
   metadata links, renderer properties, byte sizes, and SHA-256 values.
8. Reload Manager and verify PNG/MP4 downloads become enabled.
9. Mint directly and confirm a first tokenURI request starts the lazy recovery
   path.

If all controlled fixture addresses are claimed, stop and obtain a new address
plus a reviewed Sepolia Merkle-root update. Do not delete existing assets.

Production CSV upload, mainnet contract/baseURI, production R2/custom domain,
renderer hardening/freeze, marketplace setup, durability backup, and WEB-612
remain out of scope.
