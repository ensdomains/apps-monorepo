# Commemorative NFT pre-generator

One-off WEB-6 pipeline for producing static commemorative NFT PNG and JSON
artifacts. The current CLI is intentionally hard-capped at 100 items.

This workspace is separate from the legacy `commemorative-nft-generator`
runtime service so the API/Workflow cleanup can land as a deliberate follow-up.

The generator loads and validates the complete snapshot, builds the complete
OpenZeppelin Merkle tree, checks the reviewed root, and only then renders the
address-sorted pilot slice. It writes each PNG before its JSON metadata and
writes a pilot-scoped manifest last.

## Labeled pilot command

From the repository root:

```sh
corepack pnpm nft:pregenerate -- \
  --input /Users/yoginth/Downloads/bq-results-20260622-151420-1782141290736.with_primary_name.csv \
  --input /Users/yoginth/Downloads/bq-results-20260622-151615-1782141389373.with_primary_name.csv \
  --legacy-swapped-trait-columns \
  --offset 0 \
  --limit 100 \
  --output /private/tmp/ensv2-labeled-pilot-100 \
  --upload
```

Export `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` before running the command.
It generates a fresh output tree and publishes it to the fixed staging target:

- Account: `15dcc9085cb794bb4f29d3e8177ac880`
- Bucket: `ensv2-commemorative-nft-staging`
- Public staging origin: `https://pub-43406b099825402eb42ecfb3494a902b.r2.dev`

The credentials should be a bucket-scoped R2 API token. Never commit them.

For local renderer development, build `ens_renderer`, serve its `dist/`
directory, omit `--upload`, and add both of these options:

```sh
--capture-renderer-origin http://127.0.0.1:4187 \
--chromium-executable '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
```

## Output contract

```text
token/<decimal-token-id>.png
token/<decimal-token-id>.json
state/<decimal-token-id>.json
manifests/pilot-0-100.json
```

`state/` is local-only resumability data. R2 receives the `token/` objects and
the scoped pilot manifest. The script deliberately never writes the production
`manifest.json` completion marker for a partial run.

Existing local or remote artifacts are reused only when their SHA-256,
content type, cache policy, metadata, renderer revision, and expected JSON all
match. A mismatch fails closed instead of overwriting an object.

## Frozen pilot inputs

- Limit: at most 100 items.
- Selection: canonical rows sorted by lowercase owner address, offset 0 by
  default.
- Full reviewed root:
  `0x203fbd8044e5acb7ef03508bb61cc0c8dfa4475ad178986471d2726db56f8c92`.
- Duplicate owner rule: largest numeric `days_held`, then `win1`, then source
  order.
- The two supplied legacy BigQuery exports have the semantic values for
  `genesis_era` and `gas_veteran` reversed. The correction is opt-in through
  `--legacy-swapped-trait-columns` so future corrected exports do not get
  silently swapped.
- The complete renderer asset graph (HTML, JavaScript, CSS, fonts, logo, and
  dynamically loaded assets) is pinned by SHA-256. If any deployed asset
  changes, the run stops until the revision is reviewed and explicitly updated.
- PNG capture waits for both Monument Grotesk weights and the decoded ENS logo,
  then calls the renderer's `capturePng({ includeText: true })` API. The top ENS
  name and bottom `ENS × Polyhop` line are therefore part of the PNG pixels.
- The renderer HTML and pinned bundle are fetched without token data. Each
  metadata-bearing document navigation is fulfilled inside Chromium, preventing
  addresses and Merkle proofs from appearing in renderer HTTP access logs.
- Seed derivation is still marked provisional in the manifest and must be
  approved before the production dataset is frozen.

Use `corepack pnpm nft:pregenerate -- --help` for all overrides, including
`--offset`, `--limit`, and renderer origins.
