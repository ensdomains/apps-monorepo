# Workhorse spec: WEB-656 Update configuration UI elements inside Manager app

## Summary

Make wallet-scoped Primary Name controls in Manager explicit, accessible chooser triggers, with consistent Material Symbols and educational copy, while preserving profile links, shared reverse-name refresh, and transaction semantics.

## Technical context

- **Language and version**: TypeScript (workspace catalog), React 19, TanStack Start/Router, Tailwind CSS 4.
- **Dependencies used or added**: Existing TanStack Query, Radix dialog/drawer primitives, Material Symbols and Lingui. No new runtime dependency is expected.
- **Testing**: `pnpm run check` at the root; `pnpm --filter manager run test`; `pnpm --filter manager run typecheck`; recorded `pnpm run e2e`; real browser journey through the project's Playwright library, with screenshots at phone and desktop widths. The coachman's blind oracle is `pnpm --filter manager run test src/features/dashboard/primaryNameControls.oracle.test.tsx` when the oracle commit is applied at harvest.
- **Constraints**: Product source changes stay in `apps/manager/`. Use the existing chooser and reverse-name query; do not change registration controls, candidate eligibility, resolver preparation, funding, signing, or transaction construction. The run's spec at the repository root is the required planning artifact, not a product change.

## Direction check

- Dashboard remains scoped to the connected wallet, not a selected ENS name. The current Dashboard already reads the owner's reverse-name query; preserve that model rather than adding selected-name state.
- Only the configured Dashboard label opens the chooser; the nameplate becomes plain display content without a chevron. The separate Go to profile link remains a link.
- A configured-primary control is a semantic button: `person_check` at rest, `published_with_changes` on hover and keyboard focus, visible focus styling. No-primary controls show `published_with_changes` at all times.
- Only My Names opts into the primary-row action; do not make every existing `NameRow` primary marker interactive. Owner and Manager remain non-interactive tags; Favorites and address-profile consumers remain outside scope.
- Desktop and mobile account navigation share the behavior: no primary means an enabled chooser action; a primary means the existing profile link. Opening the chooser must survive any popover/drawer close, and closing it must restore usable keyboard focus.
- Keep the existing successful-submission invalidation unless execution demonstrates that it does not refresh Dashboard, the primary row, and account navigation. If it fails, add the failing regression first and make the narrowest cache fix, not a new state store or reload.
- Follow `AGENTS.md`, `CLAUDE.md`, `STYLEGUIDE.md`, `apps/manager/README.md`, and `apps/manager/docs/I18N.md`: thin React, typed props, existing query patterns, semantic controls, design tokens, co-located tests, and Lingui source extraction. Do not hand-invent translations or perform Crowdin uploads.
- Use the ticket's Figma designs for spacing and states. Inspect accessible design references and screenshots; document any inability to access Figma instead of claiming pixel fidelity.

## Structure

Expected product touch points (lanes choose their own component decomposition):
- `apps/manager/src/features/dashboard/components/PrimaryNameCard.tsx` and `PrimaryBadge.tsx`, or a co-located shared primary-name control used by the card and list.
- `apps/manager/src/features/dashboard/components/NameRow.tsx` and `MyNamesList.tsx`; inspect `FavoritesList.tsx` and other callers to preserve their behavior.
- `apps/manager/src/features/dashboard/pages/DashboardPage.tsx` for the no-primary CTA.
- `apps/manager/src/features/dashboard/components/ChoosePrimaryNameDialog.tsx` for the description and, only if needed, composition supporting navigation lifetimes.
- `apps/manager/src/features/navigation/Header/account/NavSection.tsx`, `AccountContent.tsx`, `DesktopAccountSection.tsx`, and `MobileAccountDrawer.tsx` as needed for safe chooser placement.
- `apps/manager/src/components/ui/material-symbol.tsx` for the symbol allowlist.
- `apps/manager/src/locales/en/messages.po` for source-catalog extraction.
- Co-located `*.test.tsx` regression coverage. Browser probes and screenshots belong under `.postmaster/verify/`; do not add debug routes or test-only behavior to production source.
- `apps/manager/src/features/dashboard/primaryNameControls.oracle.test.tsx` is the coachman's independent pre-implementation oracle, held back from lanes until harvest.

## Decisions

- Preserve existing wallet/address and loading/error semantics; do not turn this into a Dashboard state redesign or change which names are eligible.
- Reuse a consistent configured-primary visual treatment, but keep each caller's semantic role explicit. A passive badge used elsewhere need not become a button.
- Retain primary-profile navigation when a reverse name exists, even though no-primary navigation becomes a chooser button.
- Use native button/link activation, not clickable spans or buttons nested in links. Decorative symbols do not contaminate accessible names.
- Do not broaden invalidation speculatively. Test the existing chooser success path using one shared QueryClient and then walk real submission on the isolated E2E stack. A test that manually sets every consumer's state is not proof of invalidation.
- Browser fixtures must use throwaway local infrastructure and the project's headless wallet/fixtures. Never submit transactions on a public network, write live backend favorites, reuse another run's browser server, or manipulate the unrelated main checkout.
- The blind oracle covers stable rendered control semantics at existing card/navigation interfaces, with the chooser boundary stubbed. It is not proof of dialog internals, keyboard focus styling, responsive rendering, or transaction completion; the criterion checks below supply that coverage.
- Default-source ruling (do-not-reopen): the user authorizes clean synthesis at BASE `4e8ea0c5b03f95442941b235736f295566149575` as source for workhorse branches; leave main checkout branch `jev-manager-dash-search` and untracked `.playwright-mcp/` completely untouched.

## Showing each criterion

Run browser steps at 390×844 and 1440×1000, in every theme the app actually supports. Capture each step under `.postmaster/verify/`, including before/hover/focus states where specified. Use the real Dashboard and navigation, not a test-only page. Run the ticket's six-step User journey in its written order with seeded configured and unconfigured wallets; use an isolated local backend or HTTP fixtures for Favorites, never live writes. Keep command/output/exit transcripts for automated checks. Missing infrastructure is reported as unverified or not shown, never passed.

| # | Criterion, as the ticket words it | Check (command and input) | Expected output |
|---|---|---|---|
| AC1 | The Dashboard is wallet-scoped and has no selected-name or non-primary-name card state. | Open `/dashboard` for a wallet with primary A and owned names A/B, search/filter/select B, then reconnect a wallet with no primary. Add a rendered Dashboard regression; run `pnpm --filter manager run test`. | Card continues to describe A, not B; the unconfigured wallet sees the no-primary CTA. No selected-name card state. Tests exit 0. |
| AC2 | With a configured primary name, the Dashboard's “Primary Name” label is the only chooser trigger; the displayed primary-name value is non-interactive and has no chevron. | Click and keyboard-activate the header Primary Name button; close the chooser, then click and tab past the displayed value. Check the separate Go to profile link. Add rendered card regression and run Manager tests. | Label opens Choose Primary Name; displayed value is neither a button nor a link, has no chevron and does not open a chooser. Go to profile still navigates. |
| AC3 | Configured-primary buttons show Material Symbol `person_check` at rest and `published_with_changes` on hover and keyboard focus. | On the configured Dashboard label and My Names primary-row button, move pointer away, hover, then reach the control with Tab. Inspect rendered symbols and capture all three states. | Rest shows person_check; hover and keyboard focus show published_with_changes; no layout jump and visible focus indication. |
| AC4 | In My Names, only the current primary row shows the interactive Primary Name button in place of its checkmark; Favorites and all other `NameRow` consumers do not show it. | With A primary and B non-primary, inspect both My Names rows and activate A's action without row navigation or selection. Open Favorites containing A/B, then inspect an address-profile names list. Add list/default-consumer regressions and run Manager tests. | Only A in My Names has a Primary Name button; Owner/Manager remain passive; Favorites and other consumers have no new chooser action. |
| AC5 | No-primary controls in scope—the Dashboard “Set primary name” CTA and account-navigation Primary Name Profile action—show `published_with_changes` persistently, and the symbol is added to the Material Symbol allowlist. | With no primary, inspect the CTA and navigation action at rest, hover and keyboard focus. Inspect the font request/loaded glyph and `material-symbol.tsx`; run `pnpm --filter manager run typecheck`. | Both use the configuration glyph in every state, the glyph loads rather than displaying its ligature as text, allowlist contains it, and typecheck exits 0. |
| AC6 | With no primary name, the account-navigation Primary Name Profile action is enabled on desktop and mobile, has visible hover and focus styling, and opens Choose Primary Name; with a primary name, it remains a normal link to that profile. | On both widths, open account navigation with no primary and activate Primary Name Profile by click, Enter and Space (reopen between activations). Close chooser and check focus/continued navigation. Repeat configured case and follow profile link. Add navigation lifetime regression and run Manager tests. | Unconfigured action is an enabled native button with hover/focus feedback; chooser stays open through navigation dismissal and closes cleanly. Configured action is a normal correct-profile link. |
| AC7 | The chooser description is exactly: “Your wallet address can only have one primary ENS name, which will display instead of your wallet address across apps and wallets.” | Open chooser from each changed surface in English and assert the full description, normalized for rendered whitespace. Run `pnpm --filter manager run i18n:extract` and review the source-catalog diff; run Manager tests. | Exact specified sentence; no stale description or unintended catalog/translation churn. |
| AC8 | After a successful chooser submission, the Dashboard, My Names, and account navigation refresh from the shared reverse-name query; invalidation is strengthened only if tests show the existing invalidation is insufficient. | In local browser, submit B when A is primary, then submit A from an unconfigured wallet fixture; wait for successful transaction completion without reloading and inspect card, list and navigation. Add a regression invoking the real chooser success callback with one shared QueryClient and observable reverse-query refetch; run Manager tests. | Display, primary-row action, and profile link all update without reload. Existing invalidation remains unchanged unless a failing test proves a gap. |
| AC9 | Buttons and links retain correct semantics, keyboard operation, and visible focus treatment, and spacing and visual details follow the linked Figma. | Compare screenshots to accessible ticket Figma references; Tab/Shift+Tab through changed surfaces, use Enter/Space, Escape out of chooser, and verify focus restoration. Inspect phone/desktop overflow, fonts, and console errors. Run `pnpm run check` and Manager typecheck/tests. | No nested interactive elements, accidental form submissions, hidden focus, overflow, or new console errors; design matches to the extent actually inspected. All executed automated checks exit 0. |
| AC10 | Unrelated registration-flow controls and transaction semantics are unchanged. | Review diff against BASE for registration and transaction changes; run `pnpm --filter manager run test`, `pnpm --filter manager run typecheck`, and root `pnpm run e2e`, including existing primary-name post-registration coverage. | No unrelated registration/transaction implementation changes; existing regressions and browser suite pass. Report infrastructure failures precisely instead of weakening checks. |

## Tasks

- [ ] T001 [P] [AC1] Preserve wallet-scoped query flow in `apps/manager/src/features/dashboard/pages/DashboardPage.tsx` and cover it in a co-located rendered test.
- [ ] T002 [P] [AC2] Move the chooser trigger to the label and make the value non-interactive in `apps/manager/src/features/dashboard/components/PrimaryNameCard.tsx`.
- [ ] T003 [AC3] Implement shared configured-primary rest/hover/focus treatment under `apps/manager/src/features/dashboard/components/`, retaining a passive badge where needed.
- [ ] T004 [AC4] Opt My Names into the action through `apps/manager/src/features/dashboard/components/MyNamesList.tsx` and `NameRow.tsx`; test default/Favorites exclusion.
- [ ] T005 [P] [AC5] Add the Material Symbol in `apps/manager/src/components/ui/material-symbol.tsx` and update the no-primary CTA in `apps/manager/src/features/dashboard/pages/DashboardPage.tsx`.
- [ ] T006 [AC6] Implement the no-primary action and safe dialog lifetime in `apps/manager/src/features/navigation/Header/account/NavSection.tsx` and its desktop/mobile hosts as needed; test both configured and unconfigured behavior.
- [ ] T007 [P] [AC7] Update description in `apps/manager/src/features/dashboard/components/ChoosePrimaryNameDialog.tsx` and extract `apps/manager/src/locales/en/messages.po`.
- [ ] T008 [AC8] Add chooser-success/shared-query regression beside `apps/manager/src/features/dashboard/components/ChoosePrimaryNameDialog.tsx`; preserve existing invalidation unless it demonstrably fails.
- [ ] T009 [AC9] Walk real changed surfaces at both widths, compare design states, and record screenshots/transcripts under `.postmaster/verify/`.
- [ ] T010 [AC10] Review scoped diff, run full gate, Manager typecheck/tests, browser suite and recorded journey; keep final-code evidence under `.postmaster/verify/` and write the required final `WORKHORSE-SUMMARY.md` only after checks (or `WORKHORSE-BLOCKED.md` if an approved check cannot hold as written).
