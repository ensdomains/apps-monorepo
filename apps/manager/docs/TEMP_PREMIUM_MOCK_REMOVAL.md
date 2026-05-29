# Temporary Premium Mock — Pre-Review Cleanup

This document enumerates everything the temp-premium simulation layer adds to
the codebase, and the exact steps to remove it before opening the PR for
review. The production temp-premium feature (banner, chart, pill animation,
cart breakdown, refetch cadence) is independent of the mock and should
remain in place after cleanup.

## Why a separate cleanup pass

The mock was added so QA / design could land on `/register/tem.eth` and
watch the cooldown decay in compressed real time without needing a name
that's actually in its 21-day window. It is **dev-only**: gated by
`import.meta.env.DEV` plus an empty `VITE_FF_MOCK_TEMP_PREMIUM_LABELS`,
so it has no runtime effect in production. But it adds ~3 files of
infrastructure that don't belong in the merged PR — better to ship the
production feature clean and reintroduce mocking later as its own utility
if needed.

## Files to delete

Both are dev-only utilities with no production consumers:

- [ ] `apps/manager/src/features/register-v2/data/mocks/tempPremiumMock.ts`
- [ ] `apps/manager/src/features/register-v2/data/mocks/mockClock.ts`
- [ ] Delete the empty `apps/manager/src/features/register-v2/data/mocks/`
      directory if nothing else lands in it.

## Files to modify

### `apps/manager/src/features/register-v2/data/queries/pricing.query.ts`

Remove the mock branch from `getPricing`.

- [ ] Drop the import line:
  ```ts
  import { buildMockedPricing, isTempPremiumMocked } from '../mocks/tempPremiumMock'
  ```
- [ ] Remove the early-return mock branch at the top of `getPricing`:
  ```ts
  if (isTempPremiumMocked(name)) {
    const mocked = yield* fromPromise(
      buildMockedPricing(durationInSeconds, token, name),
      (e) => new GetPricingError({ cause: e as ReadContractErrorType }),
    )
    return ok(mocked)
  }
  ```
- [ ] **Decide**: keep `VITE_FF_PRICING_REFETCH_MS` or hardcode `60_000`?
  The env override is technically not mock-specific (it's a generic dev
  tuning knob for refresh cadence), but it was added in the same wave.
  Recommended: drop the override and inline `refetchInterval: 60_000`
  with a comment explaining the choice, so production config is
  literal.

### `apps/manager/src/features/register-v2/data/queries/availability.query.ts`

Remove the mock branch from the `queryFn`.

- [ ] Drop the imports:
  ```ts
  import { okAsync } from 'neverthrow'
  import {
    buildMockedAvailability,
    isTempPremiumMocked,
  } from '../mocks/tempPremiumMock'
  ```
- [ ] Drop the `labelOnly` derivation.
- [ ] Restore the `queryFn` to its original one-liner:
  ```ts
  queryFn: () => checkRealNameAvailability(normalizedName),
  ```

### `apps/manager/src/features/register-v2/workflow/pricing/components/PriceCooldownBanner/PriceCooldownBannerSection.tsx`

Stop importing `mockNow` and pass `Date.now` directly to the ticker.

- [ ] Drop the import:
  ```ts
  import { mockNow } from '../../../../data/mocks/mockClock'
  ```
- [ ] Update the `useTickingNowMs` call:
  ```ts
  const nowMs = useTickingNowMs(1_000, tickEnabled, mockNow)
  //                                              ^^^^^^^^
  //                                              becomes Date.now (or drop the arg entirely)
  ```
- [ ] Trim the surrounding comment about `mockNow` / `VITE_FF_MOCK_TEMP_PREMIUM_TIME_SCALE`.

### `apps/manager/src/features/register-v2/workflow/pricing/components/PriceCooldownBanner/useTickingNowMs.ts`

The `nowFn` parameter only exists to support the mock clock injection.
Once `PriceCooldownBannerSection` stops passing it, the parameter can be
removed.

- [ ] Drop the `nowFn` parameter (or leave it with default `Date.now` if
  you want to keep the hook generic for future use). Recommended: drop
  it to keep the hook's surface minimal — easier to reason about, easier
  to migrate into a shared package later.

## Env vars to remove

From `apps/manager/.env.local` (or any local env file that has them):

- [ ] `VITE_FF_MOCK_TEMP_PREMIUM_LABELS`
- [ ] `VITE_FF_MOCK_TEMP_PREMIUM_AGE_DAYS`
- [ ] `VITE_FF_MOCK_TEMP_PREMIUM_TIME_SCALE`
- [ ] `VITE_FF_PRICING_REFETCH_MS` (only if you also removed the override in `pricing.query.ts`)

These are dev-only Vite env vars; they don't appear in any committed
`.env*` files, so nothing to remove from the repo on this front. Just
clean them out of your local shell / `.env.local` so you can verify the
production behavior end-to-end.

## Verification after cleanup

Run these in order. Each one should pass cleanly.

- [ ] `pnpm typecheck` from `apps/manager/` — zero new errors. (Pre-existing
  `@ens-apps/smart-account` package errors are unrelated, leave them.)
- [ ] `pnpm lint` — no new lint warnings.
- [ ] Smoke test a real name not in cooldown:
  - Navigate to `/register/<some-fresh-name>.eth`
  - Confirm the cooldown banner does **not** appear (premium = 0)
  - Confirm the cart total + duration presets show real values
- [ ] Smoke test a real name actually in cooldown (if you can find one on
  Sepolia, or coordinate with QA to put a known label into cooldown):
  - Banner appears with the real premium decaying every 60s
  - Chart `now` dot crawls at the real (slow) rate
  - Cart total decreases visibly over ~1–2 minutes
- [ ] Grep the repo for orphaned mock references:
  ```
  rg "tempPremiumMock|mockClock|MOCK_TEMP_PREMIUM|VITE_FF_MOCK_TEMP_PREMIUM" apps/manager
  rg "isTempPremiumMocked|buildMockedPricing|buildMockedAvailability|mockNow" apps/manager
  ```
  Both should return zero results.

## What stays in the production PR

For reference, these changes are **product features** — they stay merged:

- `pricing.query.ts` — `refetchInterval: 60_000` (the 60s polling cadence)
- `PriceCooldownBannerSection.tsx` — `premiumStartDate` anchored in a ref,
  `useTickingNowMs(1000)` driving the chart dot + live premium label
- `useTickingNowMs.ts` — the 1s ticker hook itself
- `PriceCooldownFeePills.tsx` / `PriceCooldownBanner.tsx` /
  `types.ts` — `currentPremiumValue` prop + `AnimateNumber` rendering
- `PaymentCardLineItems.tsx` (renamed from `PaymentCardPremiumLine.tsx`) —
  base + cooldown breakdown lines
- `PaymentCard.tsx` — passes `basePrice` to render the breakdown
- `DurationPresetRow.tsx` / `DurationSelector.tsx` — preset cards display
  `basePrice × years` (not total) so durations are visually distinguishable
- `ChartValuePill.tsx` — pill component for chart labels
- `TemporaryPremiumChart.tsx` — uses `ChartValuePill` for now / selected /
  hover labels
- `usePriceCooldownChartSelection.tsx` — `NO_SELECTION` sentinel +
  three-state target-price helper text
- `PriceCooldownExpandedContent.tsx` — flat label-wrapped input with `$`
  prefix and `+ $X/year base price` suffix
- `material-symbol.tsx` — added `receipt_long` to the allowed icon list
