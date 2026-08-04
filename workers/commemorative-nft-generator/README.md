# Commemorative NFT generator

Standalone capture service intended for an EC2 NVIDIA instance. Cloudflare
Workflows owns durable job state and calls this service synchronously; this
process intentionally has no in-memory job queue.

For each token, the generator:

1. Reads and validates `render-input/<tokenId>.json` from staging R2.
2. Opens the pinned renderer in headless Chromium with WebGL.
3. Captures PNG and H.264 MP4 through `ens.faceCapture`.
4. Canonicalizes Chromium timestamp-bearing MP4 fields.
5. Writes PNG and MP4 with SHA-256 metadata.
6. Writes ERC-721 metadata only after both media objects are present.
7. Re-reads all three objects and verifies their hashes, runtime, and revision.
8. Writes `tokens/<tokenId>.complete.json` last with the verified artifact
   records, then returns their hashes and byte sizes.

Every API request except `/livez` and `/healthz` requires a bearer token. Do not rely on an
EC2 security group to identify a particular Cloudflare Worker: Worker egress
does not provide a stable, Worker-specific source address. Put the service
behind HTTPS, keep the instance port private, and use the shared bearer token
as the application-level authorization boundary.

## Graphics modes and readiness

`CHROMIUM_GRAPHICS_MODE` is explicit and fail-closed:

- `ec2-nvidia` is the default for staging. It launches regular Chromium with a
  Linux Vulkan profile derived from the upstream renderer harness, removes
  Playwright's unsafe SwiftShader fallback, and disables the software rasterizer.
  `/healthz` returns `503` unless WebGL reports an NVIDIA renderer and a one-frame
  H.264 WebCodecs probe emits encoded bytes. Each capture checks both
  capabilities again before creating media.
- `software` deliberately uses SwiftShader for local development. Generated
  artifacts are labeled `local-software`, so they cannot be mistaken for
  staging GPU output. It must use a separate `R2_BUCKET_NAME`; configuration
  fails if software mode targets `ensv2-commemorative-nft-staging`.

The upstream `ens_renderer` GPU harness at commit
`ae4890dc53369d249f837a4c234b8ba11e772e2a` validated Puppeteer-managed Chrome
for Testing on a Tesla T4 `g4dn.xlarge` with
`--use-angle=vulkan --enable-features=Vulkan`. Those flags and its
background-throttling safeguards are built into `ec2-nvidia`; Linux `gl` and
default ANGLE modes did not create a usable WebGL context in that harness. Use
`CHROMIUM_EXTRA_ARGS_JSON` only for additional reviewed flags. Known conflicts
with the Vulkan profile are rejected, and runtime probes remain the final gate.

The upstream 3.77-second result exercised `ens.loopExporter`, which renders the
full 3D canvas directly into `VideoFrame`. This service intentionally uses the
face-only `ens.faceCapture` path, including render-target readback, PNG capture,
MP4 canonicalization, and validation. Do not use 3.77 seconds for service
capacity or cost estimates. The exact face-only path still needs to be measured
on the ENS GPU instance.

A successful local test or process start is not proof of GPU acceleration. On
EC2, require a `200` response from `/healthz` with
`graphics.backend: "nvidia"`, `graphics.gpuBacked: true`, and
`encoder.ready: true` before sending capture traffic. The health response also
reports `encoder.quantizerSupported` for the renderer quality rollout.

`/livez` is a cheap process-liveness route for frequent ingress checks.
`/healthz` is the deployment-readiness gate: it runs the bounded Chromium/GPU
probe, caches a success for ten minutes, retries failures after fifteen seconds,
and never overlaps a media capture. A probe that does not complete within 30
seconds fails closed.

Simon's tested Chrome-for-Testing setup found its headless-shell binary lacked
the required H.264 encoder. When `CHROMIUM_EXECUTABLE_PATH` is empty, the
service selects Playwright's regular Chromium channel instead of its headless
shell. A configured browser is accepted only when the runtime H.264 probe
succeeds.

## GPU benchmark

Once access to the GPU instance is available, run the checked-in Sepolia
fixture repeatedly with one command from this workspace:

```sh
BENCHMARK_RENDER_INPUT_URL=https://pub-43406b099825402eb42ecfb3494a902b.r2.dev/render-input/46455108410614081663945406319915307572171076188378075311311703967581922008221.json \
BENCHMARK_TOKEN_ID=46455108410614081663945406319915307572171076188378075311311703967581922008221 \
RENDERER_REVISION=sha256:1571ef297695dea0e1b816bb27dc5302209124424cb224e8effdd0ac7a7a3102 \
BENCHMARK_OUTPUT_DIR=./benchmark-output \
pnpm benchmark:gpu
```

Optional settings are `BENCHMARK_WARMUP_RUNS` (default `1`) and
`BENCHMARK_REPEAT_RUNS` (default `3`, minimum `2`). The command uses the same
regular-Chromium launcher, NVIDIA/H.264 probe, renderer validation, PNG capture, MP4
canonicalization, and media validation as the service. It prints JSON with
per-run durations, byte sizes, and hashes, p50/p95 timing, and determinism. When
`BENCHMARK_OUTPUT_DIR` is set, the first measured PNG/MP4 pair is written there
for Simon's QA.

The default three measured runs are a quick determinism smoke test. Set
`BENCHMARK_REPEAT_RUNS=20` when collecting a timing report intended to compare
hosts or estimate cost; include the EC2 hourly price and image/driver versions
alongside the emitted JSON.

The benchmark requires NVIDIA-backed WebGL and a working H.264 encoder and never
reads or writes R2, so no R2 or generator-service credentials are required. It
exits non-zero if runtime readiness or byte determinism fails.

## Renderer encoder quality dependency

The renderer's face-only exporter currently requests a fixed 6 Mbps bitrate.
The quantizer change in renderer PR 3 updates `LoopExporter`, not
`FaceCapture`, so it does not improve media generated by this service. Its QP 20
quality and file-size evidence is Windows-only. Before publishing immutable
quality-approved media, the renderer must reuse the QP 20 encoder selection in
`FaceCapture`, deploy it, and publish a new bundle digest. Then update
`RENDERER_REVISION` in the generator and Worker configuration and use a fresh
controlled token. The health report's `encoder.quantizerSupported` only proves
that a one-frame QP 20 probe emitted bytes; the face-only benchmark and visual
QA must establish Linux output quality. Do not switch this service to
`LoopExporter`; that would change the product artifact from the face-only NFT
to the full 3D scene.

## Environment

Copy `.env.example` into the deployment secret/configuration system and fill
the empty values. Do not commit a populated `.env` file.

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
- `CAPTURE_TIMEOUT_MS=390000` (reserves the rest of the ten-minute request for bounded R2 reads and writes)
- `CHROMIUM_EXECUTABLE_PATH=/path/to/chromium` (empty uses Playwright's regular Chromium channel)
- `CHROMIUM_GRAPHICS_MODE=ec2-nvidia` (`software` for local development)
- `CHROMIUM_EXTRA_ARGS_JSON=[]`
- `NFT_EXTERNAL_ORIGIN=https://app.ens.dev/migration/nft`

R2 credentials must be scoped to the staging bucket and supplied to the EC2
service through the deployment secret store. They must never be exposed to
Manager or committed. Chromium child processes receive a filtered environment
without token, access-key, password, credential, or secret variables.

For an isolated Worker preview, override both URL-bearing values before the
first capture:

```text
NFT_PUBLIC_ASSET_ORIGIN=https://<preview-worker>.<account>.workers.dev/v1/commemorative-nft
NFT_EXTERNAL_ORIGIN=http://localhost:3000/migration/nft
```

`NFT_EXTERNAL_ORIGIN` is written exactly as the metadata `external_url`; the
generator does not append a token ID. Metadata is immutable, so a capture
created with the wrong asset or external origin cannot be corrected later. Use
only an agreed controlled token in the shared staging bucket.

## Browser Run capability spike

`pnpm capability:browser-run` connects to Cloudflare Browser Run through CDP,
captures the same public render input twice, validates WebGL/PNG/H.264 MP4,
canonicalizes the MP4s, and compares both hashes. It prints
`selectedAdapter: "browser-run"` only when every requirement passes; all
failures select `"ec2-nvidia"`.

Required for the spike:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `BROWSER_RUN_RENDER_INPUT_URL`
- `BROWSER_RUN_TOKEN_ID`
- `RENDERER_REVISION`

The staging Worker uses the EC2 NVIDIA adapter unless a recorded Browser Run
report passes this test.

## NVIDIA service deployment contract

The image advertises the NVIDIA graphics/video driver capabilities but does not
install host drivers. The EC2 host must provide a working NVIDIA driver and the
NVIDIA Container Toolkit. Build from the repository root so the workspace lock
file is available; `Dockerfile.dockerignore` keeps unrelated files and secrets
out of that build context:

```sh
docker build \
  --file workers/commemorative-nft-generator/Dockerfile \
  --tag commemorative-nft-generator:staging \
  .

docker run --detach \
  --name commemorative-nft-generator \
  --gpus all \
  --init \
  --ipc=host \
  --restart unless-stopped \
  --security-opt seccomp=/etc/ens/playwright-seccomp.json \
  --env-file /etc/ens/commemorative-nft-generator.env \
  --publish 127.0.0.1:3000:3000 \
  commemorative-nft-generator:staging

curl --fail http://127.0.0.1:3000/livez
curl --fail http://127.0.0.1:3000/healthz
```

Keep `/etc/ens/commemorative-nft-generator.env` readable only by the deployment
account. The loopback bind intentionally requires a same-host TLS proxy or an
explicitly reviewed private ingress path; do not change it to a public bind as
a shortcut.

The image runs as Playwright's unprivileged `pwuser` and does not disable the
Chromium sandbox. Install the upstream Playwright
[`seccomp_profile.json`](https://github.com/microsoft/playwright/blob/main/utils/docker/seccomp_profile.json)
at the path shown above; it is Docker's default profile with the user-namespace
permissions required by Chromium. Do not replace it with `seccomp=unconfined`
or add `SYS_ADMIN` in staging.

The deployment must provide all of the following without requiring code
changes:

1. Launch the container with GPU access (for example, `--gpus all`). The
   harness-derived Vulkan profile is built in; keep
   `CHROMIUM_EXTRA_ARGS_JSON=[]` unless another flag has been reviewed on the
   target image.
2. Load `.env.example` values from the host's secret/configuration manager. The
   populated environment file must not be copied into the image or repository.
3. Run behind a TLS-terminating reverse proxy or load balancer. Expose only
   HTTPS publicly; keep port `3000` reachable only from that ingress layer.
4. Use a long random `GENERATOR_AUTH_TOKEN`, shared only with the API Worker,
   plus ingress rate limiting. Network allowlisting is optional defense in
   depth only when the chosen egress path supplies a stable address.
5. Supervise the process with the host scheduler or a container restart policy,
   and preserve stdout/stderr logs outside the container.
6. Configure the frequent ingress health check to call `GET /livez`. Before
   enabling jobs, call `GET /healthz` and require `200`,
   `graphics.backend: "nvidia"`, `graphics.gpuBacked: true`, and
   `encoder.ready: true`.
7. Publish a stable HTTPS origin with no path, query, credentials, or redirect;
   that exact origin becomes `COMMEMORATIVE_NFT_GENERATOR_ORIGIN` in the Worker.

Simon validated bare Ubuntu plus Chrome for Testing, not this Playwright
container.
Run the face-only benchmark directly on the prepared host first, then repeat it
inside the exact deployment image to verify the NVIDIA Vulkan ICD and H.264
encoder survive container isolation. Only the in-container result represents
production throughput.
