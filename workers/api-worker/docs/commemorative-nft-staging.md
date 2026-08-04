# ENSv2 commemorative NFT staging backend

This package owns the public API and durable orchestration. Chromium/WebGL
capture runs in a separate NVIDIA-backed service using the
`commemorative-nft-generator` workspace; the Manager never receives the
generator authentication token or R2 write credentials.

## Staging infrastructure

- R2 bucket: `ensv2-commemorative-nft-staging`
- Public R2 origin:
  `https://pub-43406b099825402eb42ecfb3494a902b.r2.dev`
- Public asset API:
  `https://app-api.ens.dev/v1/commemorative-nft`
- Renderer: `https://ens-renderer.pages.dev`
- Generator: configured through `COMMEMORATIVE_NFT_GENERATOR_ORIGIN` after the
  GPU service has a stable HTTPS origin
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
  -> authenticated HTTPS request to the NVIDIA generator
  -> PNG + canonical H.264 MP4
  -> metadata JSON
  -> re-read and SHA-256 verify all three objects
  -> tokens/<tokenId>.complete.json last
```

`GET|HEAD /v1/commemorative-nft/<tokenId>.(json|png|mp4)` serves complete
immutable objects only after a valid completion marker exists for the pinned
renderer revision and NVIDIA runtime. Missing, malformed, or stale markers are
not ready and start or resume the same Workflow for a known minted token. The
route returns `503` with `Retry-After: 15`; unknown or unminted assets return
`404`, and the explicit prepare route returns `409` for a known unminted token.
The first activation consumes a token-scoped, one-hour KV admission window;
active workflows remain observable without consuming another admission. A
terminal Workflow can be restarted after a one-minute recovery cooldown, so a
failed job is manually retryable without opening an unbounded restart loop.
Explicit preparation requests rejected by either boundary return `429`.

Eligibility remains a direct R2 read and claimed status remains a direct
contract read. There are intentionally no eligibility, Merkle-proof, or mint
status API routes.

## Worker-to-generator contract

The Workflow makes an authenticated `POST` request with no body to:

```text
<COMMEMORATIVE_NFT_GENERATOR_ORIGIN>/v1/tokens/<tokenId>/capture
<COMMEMORATIVE_NFT_GENERATOR_ORIGIN>/v1/tokens/<tokenId>/publish
<COMMEMORATIVE_NFT_GENERATOR_ORIGIN>/v1/tokens/<tokenId>/verify
```

The configured value must be a bare HTTPS origin. Redirects, embedded
credentials, paths, queries, and fragments are rejected. Successful responses
must identify `runtimeAdapter: "ec2-nvidia"`, the pinned renderer revision, the
requested token, and the exact expected artifact set.

Network failures, timeouts, HTTP `408`, `425`, `429`, and `5xx` responses are
retried by the Workflow. Redirects and all other `4xx` responses are
non-retryable, as are invalid JSON, an unsupported runtime adapter, a
mismatched renderer revision, or an incomplete artifact report.

## Required Worker configuration

Set these through the Cloudflare secret manager before deploying:

- `COMMEMORATIVE_NFT_GENERATOR_AUTH_TOKEN`
- existing `SEPOLIA_RPC_URL`

Set `COMMEMORATIVE_NFT_GENERATOR_ORIGIN` as a Worker variable to the deployed
GPU service's HTTPS origin. Leaving it empty fails generation safely without
sending a request.

The GPU service independently owns its renderer configuration and bucket-scoped
R2 Object Read & Write credentials for `ensv2-commemorative-nft-staging`.
Cloudflare only stores the shared generator authentication token; it does not
forward R2 credentials. Do not commit, paste, or expose any secret to Manager.

### Preview deployment safety

Do not deploy the default `wrangler.jsonc` as a preview, including by only
overriding its Worker name. That configuration contains live queue consumers,
a scheduled trigger, and shared resource bindings. An isolated preview must:

- use a distinct Worker name and `workers.dev` URL with no custom route;
- omit every unrelated queue producer, queue consumer, and cron trigger;
- use preview-specific Workflow and KV resources;
- bind only the explicitly approved staging R2 bucket; and
- point Manager asset URLs and the generator callback origin at the preview
  `workers.dev` URL.

Use the fail-closed preview template and deploy wrapper instead of the default
deployment command:

```sh
pnpm exec wrangler whoami

# Stop unless this is the intended ENS Cloudflare account.
cp wrangler.commemorative-nft-preview.example.jsonc \
  wrangler.commemorative-nft-preview.jsonc

# Create a new preview-only KV namespace, then place its ID and unique preview
# names/origins into the ignored config file.
pnpm exec wrangler kv namespace create commemorative-nft-preview-<owner>

pnpm deploy:nft-preview:check
pnpm exec wrangler secret put SEPOLIA_RPC_URL \
  --config wrangler.commemorative-nft-preview.jsonc
pnpm exec wrangler secret put COMMEMORATIVE_NFT_GENERATOR_AUTH_TOKEN \
  --config wrangler.commemorative-nft-preview.jsonc
pnpm deploy:nft-preview
```

The wrapper refuses the default config, live Worker/KV/Workflow names, custom
routes, queues, cron triggers, Containers, and Durable Objects before invoking
Wrangler. It allows only the reviewed staging R2 bucket. The generated local
config is gitignored because it contains operator-specific resource IDs and
origins; secrets still go through Wrangler and never into the file.

Set Manager's `VITE_COMMEMORATIVE_NFT_ASSET_ORIGIN` and the generator's
`NFT_PUBLIC_ASSET_ORIGIN` to the resulting
`https://<preview-worker>.<account>.workers.dev/v1/commemorative-nft` URL. Do
this before capture because the generated metadata is immutable.

Source readiness does not mean that any Cloudflare or AWS resource has been
created or deployed.

## GPU service handoff

The upstream `ens_renderer` harness at commit
`ae4890dc53369d249f837a4c234b8ba11e772e2a` proved Puppeteer-managed Chrome for
Testing plus Vulkan on a Tesla T4, but its 3.77-second result is for the
full-canvas `LoopExporter`.
This service generates face-only PNG/MP4 through `FaceCapture`, which performs a
different readback path. Before enabling generation, benchmark that exact path
on the selected GPU host and record the Chromium version, NVIDIA WebGL
renderer, successful one-frame H.264 WebCodecs probe, PNG and canonicalized-MP4 repeat hashes, warm
p50/p95 duration, output sizes, and cost per token.

Renderer PR 3 applies QP 20 only to `LoopExporter`; `FaceCapture` remains fixed
at 6 Mbps. Do not treat the quality fix as integrated until the renderer shares
that encoder selection with `FaceCapture`, the new bundle is deployed and
pinned, and the generator reports quantizer support. That probe establishes API
viability only; the face-only benchmark and visual QA must establish Linux
quality. Keep the Worker origin empty until those gates pass and Simon completes
visual QA.

## Publication and recovery guarantees

1. The Workflow validates a canonical decimal uint256 token and strict render
   input.
2. Capture retries five times with exponential backoff starting at 15 seconds.
   The renderer has a 6.5-minute deadline, R2 attempts are bounded at ten
   seconds, browser shutdown at ten seconds, the Worker request at ten minutes,
   and the Workflow step at eleven minutes. This leaves cleanup and persistence
   margin while allowing a busy GPU host to return `429` for several minutes
   without dropping the job.
3. The external service is called over authenticated HTTPS; capacity responses
   use `429` or `5xx` so Workflows retry them rather than losing the job.
4. R2 writes use five attempts, SHA-256 custom metadata, and
   `If-None-Match: *`.
5. PNG and MP4 are written before metadata.
6. Final verification downloads all three objects, recomputes their hashes,
   and checks content type, runtime adapter, and renderer revision.
7. A token-scoped immutable completion marker containing those verified hashes
   is written last. Public routes require this marker and never infer readiness
   from asset existence alone.
8. Partial writes are safe to retry. Conflicting immutable objects fail
   without overwrite.

## Staging acceptance

Deployment and live acceptance are intentionally separate from source
implementation:

1. Confirm Workers Paid enables Workflows.
2. Confirm the existing R2 health, CORS, eligibility, and render-input objects.
3. Deploy and validate the NVIDIA generator behind a stable HTTPS origin. Its
   `/healthz` response must confirm NVIDIA-backed WebGL and a successful
   one-frame H.264 WebCodecs probe. Use `/livez`, not the deep readiness route,
   for frequent ingress liveness checks.
4. Configure the Worker origin plus the two secrets above, then deploy the
   Worker.
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
