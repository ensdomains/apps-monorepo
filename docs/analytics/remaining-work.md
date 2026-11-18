# Remaining work

Keep review focused on correctness and the [QA checklist](qa.md), not new event volume or another framework.

## Before shipping

- Correct Manager single/bulk renewal timeout reporting and consent-transition flag-exposure reporting; see the known limitations in [configuration](configuration.md).
- Complete real-wallet stage/failure/retry QA, especially mixed bulk renewal, optional registration setup, profile image saves, NFT wallet switching and reload recovery.
- Verify staging proxy ingestion and essential flag/notice parity against the exact tested build. Prior browser passes do not verify later code changes.

## Source-map upload follow-up

Native exceptions remain captured, but production stacks may be minified/unsymbolicated. Add upload support separately: match source maps to the exact deployed artifacts, keep credentials build-only and maps out of public assets, make upload failures nonfatal, and verify an application error's original filename/function/line in staging. The existing GitHub upload secret is retained and unused; no follow-up ticket or PR has been created.

## Coverage gaps worth later work

| Area | Follow-up |
| --- | --- |
| Search | Query intent, empty/error results and abandonment before selection are not measured. Migrate the popularity API query before consolidating canonical/legacy selection events; unavailable demand is `null` while favorites remain available, and genuine zero stays `0` |
| Wallet | Connection request/rejection/connector failures need an intent/result funnel; connect/disconnect alone measures established identity |
| Manager bulk | Pre-submit selection/payment abandonment remains uninstrumented; Explorer has modal observations |
| Advanced operations | Primary-name/subname/resolver/role/DNS outcomes show adoption, not complete entry funnels. DNS import, registry deployment/parent configuration and transfer/fuse steps remain incomplete |
| Decisions | Selected duration, stablecoin identity and detailed bridge/swap/funding/recovery decisions need deliberate properties/events if product questions require them |
| Bulk partials | Explorer receipt confirmations do not provide per-name verified-expiry counts; selection counts are not partial success counts |
| Delivery | Verify native initial pageview and attribution retention after wallet restoration. Reloads create new observed segments shared by current-page views and resumed execution; blockers and closed browsers leave gaps. Revisit only with a concrete requirement, preserving native capture and identity safety |

## Revenue proposal — not implemented

Use confirmed payment events as [revenue sources](https://posthog.com/docs/revenue-analytics/capture-revenue-events) after defining the metric: protocol fees are not automatically ENS Labs revenue or total wallet spend. Separate premiums; exclude gas, funding/bridge/swap costs, refunds and excess. Use actual confirmed amounts, integer on-chain units internally, and a supported reporting currency with an explicit conversion source/time. Unknown amounts stay absent.

Attribute partial bulk payments once, including when later work fails; retries, recovery and optional setup must not count the same payment again. Validate staging totals against transactions before enabling production revenue sources. Consent-based browser analytics is a subset of traffic; complete protocol accounting belongs on-chain or in the indexer.
