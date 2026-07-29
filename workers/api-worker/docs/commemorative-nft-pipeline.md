# ENSv2 commemorative NFT snapshot pipeline

This Node-only pipeline converts one or more snapshot CSV exports into the
static objects consumed by the Manager and the future media-generation
service. It does not run in the API Worker runtime and does not expose an API
route.

## Object contract

The pipeline creates:

- `eligibility/<lowercase-address>.json`
- `render-input/<decimal-token-id>.json`
- `root.txt`
- `manifest.json`

`manifest.json` is written last and is the completion marker for a dataset.
The token ID is the decimal representation of `keccak256(address)`.

Eligibility JSON contains the canonical profile name, renderer display name,
five renderer traits, a name-derived uint32 seed, and the Merkle proof for the
address. Render-input JSON contains only the metadata required by the
renderer/generation service.

## CSV columns

- `current_owner`
- `genesis_era`
- `collection_depth`
- `gas_veteran`
- `name_archetype`

Each row must also provide a non-empty value in `primary_name`, `oldest_name`,
or `name`. The selected name is `primary_name`, then `oldest_name`, then
`name`. The parser supports quoted commas and newlines. Name fields are
treated as hostile data: they are never used as object keys or paths, and JSON
output escapes HTML-sensitive characters without changing the parsed value.

Identical duplicate address rows are counted once. Conflicting rows for the
same address fail the entire run.

## Local dry run

The default mode writes only to a new, empty local directory. It never contacts
R2.

From `workers/api-worker`:

```sh
pnpm nft:pipeline \
  --input fixtures/commemorative-nft/sample-snapshot.csv \
  --out commemorative-nft-out
```

For the production snapshot, always include the Merkle root reviewed against
the deployed contract:

```sh
pnpm nft:pipeline \
  --input /secure/path/snapshot-window-1.csv \
  --input /secure/path/snapshot-window-2.csv \
  --expected-root 0x<64-hex-characters> \
  --out commemorative-nft-out
```

The command refuses a non-empty output directory, an invalid address or trait,
a conflicting duplicate, or a root mismatch. Snapshot exports and generated
production artifacts must not be committed.

The checked-in three-address Sepolia fixture must always reproduce its reviewed
root:

```sh
pnpm nft:pipeline \
  --input fixtures/commemorative-nft-sepolia.csv \
  --expected-root 0xdf3b19d887bceb97c681618cb29e9ae6fe540599eec7567ef24586d444c02260 \
  --out commemorative-nft-out
```

## Explicit R2 upload

Uploading is impossible unless `--upload` is present. Upload mode also requires
`--expected-root` and every bucket-scoped credential below:

```sh
R2_ACCOUNT_ID=... \
R2_ACCESS_KEY_ID=... \
R2_SECRET_ACCESS_KEY=... \
R2_BUCKET_NAME=ensv2-commemorative-nft-staging \
pnpm nft:pipeline \
  --input /secure/path/snapshot.csv \
  --expected-root 0x<64-hex-characters> \
  --out commemorative-nft-out \
  --upload
```

Use an R2 API token with Object Read & Write access restricted to the one
target bucket. Never put credentials in this repository, command history,
tickets, or chat.

The uploader retries network failures, HTTP 408/425/429 responses, and 5xx
responses with exponential backoff. Every PUT includes `If-None-Match: *`, so
an existing immutable object cannot be overwritten, and includes the
hex-encoded body digest as `x-amz-meta-sha256`. Generated objects also carry
immutable cache headers. Use a fresh bucket or an agreed versioned origin for
each finalized dataset rather than correcting published objects in place.

## Verification checklist

1. Run locally without `--upload`.
2. Compare `root.txt` with the reviewed contract Merkle root.
3. Inspect `manifest.json` counts, including duplicates.
4. Parse several eligibility files and verify their proofs.
5. Review the exact R2 account and bucket name.
6. Run again with `--expected-root` and the explicit `--upload` flag.
7. Fetch representative objects through the public read origin and confirm
   `Content-Type`, CORS, and cache headers.

Both fixtures contain test-only data and are safe to commit. The synthetic
sample intentionally contains a quoted comma, an empty optional gas trait for
a Founding-era row, a hostile display name, and an identical duplicate.
