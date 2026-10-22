# ENSv2 avatar and header worker

A new service with the existing upload worker's JPEG avatar/header behavior,
using ENSv2 authorization and production hardening. Existing worker deployments,
routes and domains remain unchanged. Extra image formats and crop/animation UX
are deferred.

## Routes and uploads

`GET`, `HEAD`, `PUT /name.eth` serves mainnet avatars; `/name.eth/h` serves headers.
Prefix either with `/sepolia` for Sepolia. `GET <image-path>/meta` returns the current
revision, empty before an image exists. `/health` reports source and version metadata.
Public reads do not call an RPC and require cache revalidation.

Uploads are JSON/data URLs containing JPEGs, at most 3 MiB decoded. JPEG container
structure and declared MIME are checked. The request is bounded to 4 MiB + 16 KiB,
including streaming requests without Content-Length. SVG and other formats are rejected.

The shared `@ens-apps/shared-schema/profile-media` EIP-712 v2 contract binds normalized
name, avatar/header kind, chain, service origin, authorized account, signer, MIME,
image hash, expected revision and five-minute expiry. Read `/meta` before signing;
a 409 requires a fresh signature. Legacy signatures are not accepted.

Only active ENSv2 names can be edited. Owners may upload before resolver setup;
delegates must simulate the exact corresponding text setter. A signer using a
distinct Manager HCA must pass the shared implementation/factory/current-owner
verification. ENSv1, unregistered, expired and grace-period names are rejected.
Manager retains its existing EOA route for delegated edits; HCA-only delegated
editing through Manager is separate work.

## Existing storage and URL compatibility

| Environment | New Worker | Existing avatar bucket | Existing header bucket | Rate namespaces |
| --- | --- | --- | --- | --- |
| Staging | avatar-worker-staging | staging-avatar-storage | staging-header-storage | 2001, 2002 |
| Production | avatar-worker | avatar-storage | header-storage | 2003, 2004 |

Reuse these buckets. Do not create additional buckets or migrate objects. Existing
images are readable at the new service URL through the legacy key
`<network>/registered/<normalized-name>`, with avatar/header selected by bucket.
Successful authorized replacements update that same key so old URLs continue to
serve the replacement without changing the old worker.

Each upload retains its original JPEG under `profile-media-v2/<legacy-key>/objects/<revision>`.
The canonical legacy JPEG contains a standard non-rendering COM revision marker;
its custom metadata holds the revision and immutable original pointer. The marker
makes every new-worker publication's ETag distinct even for identical input bytes.
A conditional R2 write publishes bytes and metadata atomically. The new worker
serves the immutable original, while the old worker serves identical pixels from
the canonical JPEG. Definite precondition failures remove only the unpublished
history object; ambiguous failures retain it. Re-read `/meta` before retrying.

Concurrency and stale-revision protection cover new-worker publications. The old
writer remains independent and can overwrite the canonical object and metadata.
Its restoration of identical old bytes during an in-flight new upload cannot be
fully serialized by the new service's ETag precondition. Do not claim coordination
with the unchanged legacy writer. Old-worker, metadata-service and external caches
also retain their existing refresh policies.

## Manager opt-in

Set `VITE_PROFILE_MEDIA_URL` to the service origin to use the new signing contract.
Leave it unset for the existing uploader. The existing picker still crops and
converts to JPEG. New uploads are enabled only for ENSv2 profiles. Manual URLs and
NFT selection retain their current behavior. Prepared previews survive upload
failure. An existing legacy record URL still needs its first on-chain update to
the new service URL; replacements after that update are signature-only.

## Verification and release

From this directory use `pnpm typecheck`, `pnpm lint`, `pnpm build`. Build is a dry
run and does not deploy. `pnpm dev` uses local R2. Provide separate MAINNET_RPC_URL
and SEPOLIA_RPC_URL bindings; do not copy credentials from old workers. Match
SERVICE_ORIGIN to the public endpoint. Local development can use
`wrangler dev --var SERVICE_ORIGIN:http://localhost:8787` and ignored `.dev.vars`.
Rate limits are 30/min/IP and 10/min/verified signer, per Cloudflare location.

The dedicated release workflow manually deploys staging. Production uses
`avatar-worker-YYYY-MM-DD[.N]` tags from main or hf branches and requires staging
health to report the same source commit. Record the commit and release/version
on deployment, inspect actual bucket/RPC/rate bindings, and exercise public reads,
owner/HCA/delegate authorization, revocation, transfer, signature binding,
stale/concurrent writes and failure cases. Rehearse rollback only on this new
staging worker and verify reads again. Manager production opt-in is separate.

The worker is excluded from blanket coverage until a suite is requested. Use
existing relevant suites and focused runtime probes; do not add new test files
by default. Local scripted-RPC probes do not establish live-chain authorization.
