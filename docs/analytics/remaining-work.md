# Remaining work

Keep the first review focused on correctness and the [QA checklist](qa.md), not new event volume or another framework.

## Before shipping

- Complete real-wallet stage/failure/retry QA, especially mixed bulk renewal, optional registration setup, profile image saves, NFT wallet switching and reload recovery.
- Verify staging proxy ingestion, essential flag/notice parity and the private Cloudflare build upload variable. Inspect original source locations from the exact deployed build. Production source-map release wiring and GitHub secret exist; no deployment was performed here.
- Review the proposed public PR wording separately. The PR description was intentionally not updated during these follow-ups.

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

Use existing confirmed operation/payment events as [PostHog revenue sources](https://posthog.com/docs/revenue-analytics/capture-revenue-events); no purchase wrapper is needed. Define the amount first: registration/renewal protocol fees are not automatically ENS Labs revenue or total wallet spend. Separate premiums where applicable; exclude gas, funding/bridge/swap costs, refunds and unused excess.

Use actual confirmed amounts, not an unlabelled quote. Keep integer on-chain units internally; a proposed `revenue_usd_cents` property needs an explicit conversion source/time. [ETH is not a supported PostHog revenue currency](https://posthog.com/docs/revenue-analytics/troubleshooting), so normalize to USD or another supported currency before capture. Unknown amounts stay absent, never silently zero.

Single confirmed payments can enrich completion events. Partial bulk operations need payment-level attribution/deduplication even if later work fails; do not count the same money again on final completion, optional setup, retries or recovery. Validate staging totals against actual transactions before configuring production revenue sources. Consent-based browser attribution is a subset of traffic; complete protocol revenue belongs in on-chain/indexer accounting.
