# Code Review Guidelines

Guidance for every reviewer of this repo, human or automated. Rule sources in
priority order: this file; `.greptile/config.json` (structured rules with id,
scope, severity); `.greptile/rules.md` (severity behaviour, skip lists,
exemplar files); `STYLEGUIDE.md` (full standards with rationale); package
`CLAUDE.md` files (notably `packages/transaction-manager/CLAUDE.md` for
neverthrow + XState patterns).

## Severity

Important findings change behaviour, lose data or funds, weaken authorization,
or degrade availability or cost at scale. Everything else is a nit.

- **Important:** the defect classes and review rules below; broken persisted-data
  or API compatibility; unhandled errors at process or network boundaries;
  `high` rules in `.greptile/config.json` (STYLEGUIDE 🔴 Must).
- **Nit:** naming, structure, docs, `medium`/`low` style rules (STYLEGUIDE
  🟡 Default / 🟢 Guideline; flag `low` only when repeated or clearly hurting
  readability).
- Any rule may be intentionally broken with a justifying inline comment
  (`biome-ignore`, `greptile:`, or a short explanation) per STYLEGUIDE
  "Breaking the Rules". Check for one before flagging; if present, do not flag.
- Comments cite the rule id where one exists and include a brief corrected
  snippet. No praise as inline comments; positives belong in the summary only.

## Skip

Generated code, lock files, formatting-only diffs, and Crowdin translation
files (`**/translations/**`, `**/locales/**`, `**/*.po`). Never flag React
StrictMode double-execution, `useConnection()` versus `useAccount()`, or style
Biome already enforces. Structural tripwires (file length, prop count,
one-component-per-file) do not apply to tests, mocks, or Storybook stories.

## Always consider

For every diff, check the classes below. A change is not clean merely because
it adds a guard or helper; verify the control runs where the value is actually
populated and covers the representation actually consumed.

- **Idempotency and retries:** double-apply on redelivery, exactly-once
  bookkeeping, DLQ handling; queue consumers and webhooks must tolerate
  duplicate and out-of-order delivery.
- **Resource lifecycle:** leaked listeners, subscriptions, and handles;
  unbounded growth of maps, queues, and caches; missing aborts and timeouts on
  outbound work.
- **Authorization:** every new route, mutation, and consumer checks the right
  principal against the right resource; no authority derived from
  client-supplied identifiers alone.
- **Config and environment drift:** bindings, env vars, and feature flags exist
  in all environments; preview-versus-production behaviour stays deliberate.
- **Migration and persisted-data compatibility:** old rows, in-flight jobs, and
  rollback paths keep working; schema and serialized-format changes are
  backward-compatible or gated.
- **Efficiency:** N+1 lookups, unbounded batches, per-item network or contract
  calls that should be batched.

## Defensive review rules

Treat as untrusted: route, query, header, and body values; onchain records
(text records, avatars, contenthash); NFT metadata fields; fetched response
bodies and headers; and anything derived from them. Anyone can set a record or
mint a token.

- Untrusted values reach HTML and DOM sinks only through context-aware escaping
  or safe APIs. Raw-HTML paths need a narrow allowlist sanitizer, applied after
  full decoding (base64, percent, entities) and on every ingestion path.
  URL-valued attributes also need a scheme allowlist; escaping does not
  neutralize `javascript:` or unexpected `data:` URLs.
- Never interpolate untrusted strings into CSS (style attributes, styled
  templates, variables). Parse to a validated token and assign a single
  property.
- SVG and other script-capable formats are documents: allowlist-sanitize or
  rasterize, serve with a fixed MIME type and `X-Content-Type-Options:
  nosniff`, and keep directly navigable user content off registrable domains
  that carry wallet-connected apps.
- Validate input at the stage where the framework has populated it (after route
  match for params, after parsing for bodies), constraining every segment, not
  a subset.
- Server-side fetches of user-derived URLs: allowlist scheme and host; block
  loopback, private, link-local, and cloud-metadata ranges after DNS
  resolution; re-validate every redirect hop; stream with a hard byte cap
  (`Content-Length` is advisory); validate `Content-Type` on the consumed
  response, not a preflight; time-box the whole operation.
- Fetch allowlists, CSP source lists, and image-domain configs must not include
  hosts serving user-controlled bytes; a proxy or optimizer re-serves upstream
  bytes under its own origin.
- No automatic fetch of a user-controlled URL on render or load; require an
  explicit user action or a protected server-side proxy.
- Headless or server-side rendering of user-influenced content: JavaScript
  disabled and verified, an inline CSP in the rendered document itself,
  private-range egress blocked, bounded render time.
- HTML responses carry a restrictive CSP (start from `default-src 'none'`),
  `Cross-Origin-Opener-Policy: same-origin`, `nosniff`, and frame protections.
- Error responses are uncacheable; cache keys include everything the response
  varies on; success caching is deliberate per endpoint.
- Redirects and displayed links: parse with `new URL()`, compare the exact
  parsed scheme, host, and port against an allowlist (no substring or prefix
  tests), display the parsed host rather than the raw string, reject userinfo
  and confusable forms.
- Catch blocks never assume an error shape; a downstream timeout or malformed
  response must not crash the process or leak internals.
- Sign what you see: transaction target, calldata, value, and approval scope
  derive from the same validated state the UI displays, never silently from a
  record, query param, or fetched value; request the minimum approval scope the
  action needs.
- An ENS name used as a principal can expire and be re-registered: re-resolve
  and re-authorize at time of use, never cache name-to-address as permanent,
  and bind durable authority to stable principals.

## Monorepo scope

Changes stay within the relevant `apps/*` directory unless shared code is
genuinely required; changes under `packages/` should be justified. For ENS
domain semantics (name lifecycle, resolution, registration and renewal flows),
consult the ens-labs-wiki clone in the sibling checkout.
