# WEB-1481 migration-text accountability ledger

This is the implementation and QA ledger for the captain-approved WEB-1481 plan. It inventories the Manager migration feature's English user-visible text and its technical text boundaries. It is validation evidence, not authority to change uncited copy.

## Baseline, overlap, and decisions

- Isolated branch: `fm/web-1481-implement-migration-copy`.
- Fresh base: `origin/main` at `eeff2f0341f45a0355f70cd785b01fe6f48b0e44`; `origin/HEAD` resolved to `refs/remotes/origin/main`; branch creation and ancestry were verified before edits.
- Closed PR #1161 was not inspected as an implementation source and no code, wording, test, assumption, structure, or commit was copied/cherry-picked from it.
- `gh-axi pr view 1158 -R ensdomains/apps-monorepo --full` reported PR #1158 **merged** at `2026-09-15T12:49:27Z`. Its merge commit `554d6298e8c2f350e57ecb072d5a8b2bda6b6dcb` is an ancestor of this base. Its current-main overlap includes `GameStep`, selection/footer, success, wallet confirmation, failure/decoder, progress/service, tests, and the English/Swedish catalogs.
- Current main contained #1158's recovery lead-in and `isRecovering` marker, which conflict with approved D6. WEB-1481 explicitly removes both rather than silently retaining them. It preserves the one-at-a-time `MigrationProgress.description` subtitle and every unrelated current-main behavior.
- Current main also contained alternative footer, retry, generic-error, cleanup/standing, saved-state, and NFT-heading wording. The rows below explicitly reconcile those gaps to approved D2-D9. All uncited #1158 copy remains current-main copy with `uncited-no-change` disposition.
- No open ownership/product choice remains: D6 directly resolves the merged overlap. Merge-order risk is therefore historical, but this reconciliation must remain visible in the PR description.

Accepted copy caveats remain intentional QA evidence:

1. D2's exact footer claims the upgrade is one transaction although setup, approvals, batches, and cleanup are separate requests.
2. D3's exact reassurance may appear after earlier approvals or batches succeeded.
3. D4's exact retry sentence may overstate that nothing changed.
4. D5's exact wallet prefix can label contract/app/RPC text as wallet-reported.
5. D6 excludes a recovery lead-in, list, marker, metadata, retained history, or layout/state change.
6. D7 permits only `to move` and `bring`; D8 permits only cited count-driven grammar; D9 is English-only and freezes translation architecture.

## Dispositions and validation owners

Every row uses exactly one of the four required classifications:

- `approved-copy`: cited by Linear/Notion and either changed as directed or explicitly retained.
- `uncited-no-change`: user-visible but not authorized by WEB-1481; current-main text is preserved.
- `technical/non-user-facing`: symbols, machine keys, logs, comments, technical errors, decorative labels, generated history, or test/story-only prose that is not a product-copy slot.
- `excluded`: an exact surface that the approved plan explicitly lists in §6 or behavior D6 explicitly forbids.

Validation owner keys:

- **T-SERVICE** — `migrationProgressCopy.test.ts` and `migrationService.test.ts`; executes helper/service paths and checks descriptions, placeholders, counts, recovery event shape, request order, and completion.
- **T-GAME** — `GameStep.test.tsx`; renders heading/fallback/recovery one/many/multi-batch states and proves no recovery lead-in/list.
- **T-SELECT** — `SelectNamesStep.test.tsx`; renders preparation, fee, account-error, CTA, saved-state, and the adjacent uncited helper.
- **T-WALLET** — `WalletConfirmationStepsDialog.test.tsx`; renders every descriptor, placeholder/count branch, footer, trigger, dialog, and focus return.
- **T-FAIL** — `MigrationPage.test.tsx` plus `decodeMigrationError.test.ts`; renders every failure family/action/reassurance branch and executes `ParentNotMigrated` decoding.
- **T-SUCCESS** — `MigrationSuccessDialog.test.tsx`; renders plain/NFT completion one/many plus support/action.
- **V-COPY** — deterministic Storybook stories in `MigrationCopy.stories.tsx` and `MigrationSuccessDialog.stories.tsx`, reviewed with `chrome-devtools-axi` at desktop and 375 px.
- **C-PO** — unchanged `i18n:extract`/`i18n:compile`, active English catalog comparison, and catalog-diff reconciliation.
- **D-ALLOW** — final base-to-head diff allowlist review; every uncited row must have no product-source diff.
- **R-TECH** — explicit technical-boundary review against the final diff and type tests.

## Cited runtime progress and fallback

| Source/state | Base text/template | Approved result | Disposition | Authority/reason | Validation owner |
|---|---|---|---|---|---|
| `service/migrationService.ts:409-445`, account setup | `Getting ready`; `Ready`; `Already set up` (already present on base) | same | `approved-copy` | Notion §5A replacements | T-SERVICE |
| `service/migrationService.ts:450-462`, one registration approval | `Getting permission to upgrade this name` | same | `approved-copy` | Notion §5A | T-SERVICE |
| same, registrations/wrapped/managers | `Getting permission to upgrade your names`; `Getting permission to upgrade your wrapped names`; `Getting permission to restore your managers` | same | `approved-copy` | Notion §5A | T-SERVICE |
| `service/migrationService.ts:548-564`, approval status | `Permission already granted`; `Permission granted` | same | `approved-copy` | Notion §5A | T-SERVICE |
| `service/migrationProgressCopy.ts:6-20`, one operation | `Upgrading {name}` / `Copying {name}` | same | `approved-copy` | Notion §5A; `{name}` preserved | T-SERVICE |
| same, migrate-only count | `Upgrading {count} name` / `Upgrading {count} names` | same | `approved-copy` | Notion + D8 count grammar | T-SERVICE |
| same, copy-only count | `Copying {count} name` / `Copying {count} names` | same | `approved-copy` | Notion + D8 count grammar | T-SERVICE |
| same, mixed count | `Upgrading {migratedCount} name(s), copying {copiedCount}` | count-driven `name`/`names`; copied count preserved | `approved-copy` | Notion + D8 | T-SERVICE |
| `migrationService.ts:1493`, batch completion | `Batch confirmed` | same | `approved-copy` | Notion §5A | T-SERVICE |
| `migrationService.ts:572-594`, cleanup | `Removing temporary access` | same | `approved-copy` | Notion §5A | T-SERVICE |
| same, cleanup completed | `Temporary access removed` | unchanged | `approved-copy` | Notion “Keep” | T-SERVICE |
| `migrationService.ts:1608`, completion fallback | `Upgrade complete` | same | `approved-copy` | Notion §5A | T-SERVICE |
| `GameStep.tsx:121`, initial fallback | `Getting ready...` | unchanged | `approved-copy` | Notion “Keep” | T-GAME |
| `GameStep.tsx:122-151`, setup/approval/cleanup fallback | `Setting things up...`; `Approve this name in your wallet...`; `Approve the temporary account in your wallet...`; `Approve restoring your managers in your wallet...`; `Removing temporary access...` | same | `approved-copy` | Notion §5B | T-GAME, C-PO |
| `GameStep.tsx:140-149`, one batch fallback | `Upgrading 1 name...` / `Upgrading {count} names...` | same | `approved-copy` | Notion + D8; `{count}` preserved | T-GAME, C-PO |
| same, multi-batch fallback | `Upgrading batch {batchNumber} of {total} (1 name)...` / `...({count} names)...` | same | `approved-copy` | Notion + D8; `{batchNumber}`, `{total}`, `{count}` preserved | T-GAME, C-PO |
| `GameStep.tsx:308-314`, plural heading | `Upgrading your names...` | unchanged | `approved-copy` | Notion heading keep | T-GAME, C-PO |
| same, singular heading | `Upgrading your name...` | same | `approved-copy` | D8 missing singular | T-GAME, C-PO |

## Cited recovery text and D6 exclusion

All six rows render one at a time in the existing animated subtitle. `{name}`, `{count}`, `{migratedCount}`, and `{copiedCount}` are preserved. There is no list/lead-in/marker/metadata.

| Source/state | Approved result | Disposition | Authority/reason | Validation owner |
|---|---|---|---|---|
| `migrationProgressCopy.ts:23-42`, one migrate | `{name} was already upgraded` | `approved-copy` | Notion §5C, D6 | T-SERVICE, T-GAME |
| same, one copy | `{name} was already copied` | `approved-copy` | Notion §5C, D6 | T-SERVICE, T-GAME |
| same, defensive unknown action | `{name} was already done` | `approved-copy` | Notion §5C, D6 | T-SERVICE, T-GAME |
| same, migrate-only group | `{count} names were already upgraded` | `approved-copy` | Notion §5C, D6 | T-SERVICE, T-GAME |
| same, copy-only group | `{count} names were already copied` | `approved-copy` | Notion §5C, D6 | T-SERVICE, T-GAME |
| same, mixed group | `{migratedCount} already upgraded, {copiedCount} already copied` | `approved-copy` | Notion §5C, D6 | T-SERVICE, T-GAME |
| `GameStep.tsx` + `MigrationProgress` | base had `Picking up where you left off` and `isRecovering` | absent; prose-only event shape | `excluded` | D6 explicit exclusion and merged #1158 reconciliation | T-SERVICE, T-GAME, D-ALLOW |

## Cited selection, fee, saved-state, and CTA copy

| Source/state | Base text/template | Approved result | Disposition | Authority/reason | Validation owner |
|---|---|---|---|---|---|
| `SelectNamesStepFooter.tsx:25-29`, wallet funding | `Getting your wallet ready...` | same | `approved-copy` | Notion §5D | T-SELECT, C-PO |
| same `:33-37`, estimate loading | `Estimating the network fee...` | same | `approved-copy` | Notion §5D | T-SELECT, C-PO |
| same `:39-55`, fee, one | `Estimated network fee: ~{amount} ETH. You'll approve 1 request.` + `Your wallet shows the final fee before you approve.` | same | `approved-copy` | Notion §5D; `{amount}` and request trigger preserved | T-SELECT, T-WALLET, C-PO |
| same, fee, many | `Estimated network fee: ~{amount} ETH. You'll approve {count} requests.` + final-fee sentence | same | `approved-copy` | Notion + D8; `{count}` is descriptor count | T-SELECT, T-WALLET, C-PO |
| same `:57-63`, error | `Couldn't estimate the network fee` | same | `approved-copy` | Notion §5D | T-SELECT, C-PO |
| same, account error | `Couldn't estimate the network fee: {accountError}` | same | `approved-copy` | Notion §5D; raw placeholder preserved | T-SELECT |
| same `:78-88`, transient CTA | `Starting...`; `Estimating...`; `Preparing wallet...` | unchanged | `approved-copy` | Notion “Keep” | T-SELECT, C-PO |
| same, one CTA | `Upgrade 1 name` | same | `approved-copy` | D8 exact singular | T-SELECT, C-PO |
| same, many CTA | `Upgrade {count} names` | unchanged | `approved-copy` | Notion “Keep”; `{count}` preserved | T-SELECT, C-PO |
| `SelectNamesStep.tsx:101-105`, stale heading | `Your saved upgrade needs attention` | unchanged | `approved-copy` | Notion “Keep” | T-SELECT, C-PO |
| same `:118-123`, stale explanation | base used curly `can’t` | `Something about your names changed since you last tried, so we can't safely pick up where you left off.` | `approved-copy` | Notion exact ASCII apostrophe | T-SELECT, C-PO |
| same `:124-129`, stale support | `Your saved progress is unchanged. Contact ENS support before trying again.` | `Nothing has been lost. Contact ENS support before trying again.` | `approved-copy` | Notion §5F | T-SELECT, C-PO |

## Cited wallet-confirmation copy

| Source/state | Approved result | Disposition | Authority/reason | Validation owner |
|---|---|---|---|---|
| `WalletConfirmationStepsDialog.tsx:145-165`, trigger/heading/description | `{count} request` / `{count} requests`; `What you'll approve`; `Your wallet will show one request.` / `Your wallet will show {count} requests in this order.` | `approved-copy` | Notion §5H + D8 | T-WALLET, C-PO |
| same `:19-29`, setup row | `Set up temporary access`; `Creates a temporary account to carry out the upgrade for you.` | `approved-copy` | Notion §5H | T-WALLET, C-PO |
| same `:32-47`, named/fallback registration row | `Approve {name}` / `Approve registration`; `Allow this temporary account to move this name.` | `approved-copy` | Notion “Keep” + D7 | T-WALLET, C-PO |
| same `:49-67`, registrations row | `Approve 1 name` / `Approve {count} names`; `One approval covers all the .eth names you selected.` | `approved-copy` | Notion + D8 | T-WALLET, C-PO |
| same no-count defensive branch | `Approve your names` | `uncited-no-change` | Runtime fallback is not a Notion branch | T-WALLET, D-ALLOW |
| same `:69-78`, wrapped row | `Approve your wrapped names`; `Let this temporary account move your wrapped names.` | `approved-copy` | Notion §5H | T-WALLET, C-PO |
| same `:80-88`, managers row | `Restore your managers`; `Keep the same managers on your names after the upgrade.` | `approved-copy` | Notion §5H | T-WALLET, C-PO |
| same `:90-108`, one/multi-batch row | `Upgrade 1 name` / `Upgrade {count} names` / `Upgrade batch {batchNumber} of {total}`; `Upgrade your names and bring their records across.` | `approved-copy` | Notion “Keep”, D7, D8 | T-WALLET, C-PO |
| same `:110-118`, cleanup row | `Remove temporary access`; `Remove the temporary permission after the upgrade.` | `approved-copy` | Notion §5H / “Keep” | T-WALLET, C-PO |
| same `:184-190`, footer | base had per-batch corrective alternative | `Your names are upgraded in a single transaction. If any part of it fails, nothing changes. Nothing is signed automatically, so review every request in your wallet.` | `approved-copy` | D2 exact accepted-risk wording | T-WALLET, C-PO |

## Cited failure and action copy

Every non-cleanup failure renders count-driven `Your name is safe.` / `Your names are safe.`. Cleanup renders no standing reassurance. All rows render under `Upgrade didn't finish`.

| `MigrationError` route at `MigrationPage.tsx:74-174` | Approved body | Disposition | Authority/reason | Validation owner |
|---|---|---|---|---|
| heading | `Upgrade didn't finish` | `approved-copy` | Notion §5E | T-FAIL, C-PO |
| non-cleanup reassurance, one/many | `Your name is safe.` / `Your names are safe.` | `approved-copy` | D3 + D8 | T-FAIL, C-PO |
| `plan-changed` | `Your permissions changed. Go back to check the updated estimate.` | `approved-copy` | Notion | T-FAIL |
| `retry-blocked` | `We couldn't safely retry. Nothing was submitted and nothing changed.` | `approved-copy` | D4 exact accepted-risk wording | T-FAIL, C-PO |
| `cleanup-failed`, one/many | `Your name was upgraded. One thing left: a temporary permission on your name still needs to be removed.` / plural `names` form | `approved-copy` | Notion + D8 | T-FAIL, C-PO |
| `profile-fetch-failed` | `We couldn't read your current records.` | `approved-copy` | Notion | T-FAIL |
| `user-rejected` | `You cancelled the request.` | `approved-copy` | Notion | T-FAIL |
| `preflight-timeout` | `This is taking longer than expected.` | `approved-copy` | Notion “Keep” | T-FAIL |
| `permission-missing` | `A permission is missing. Try again.` | `approved-copy` | Notion | T-FAIL |
| `token-owner-changed` | `One of your names changed owners. Refresh and select it again.` | `approved-copy` | Notion “Keep” | T-FAIL |
| `hca-owner-mismatch` | `This wasn't set up with the wallet you're using now. Connect the original wallet.` | `approved-copy` | Notion | T-FAIL |
| `direct-transfer-unauthorized`; `name-data-mismatch`; `invalid-data` | `Something went wrong. Refresh and try again.` | `approved-copy` | Notion | T-FAIL |
| `name-not-locked`; `name-requires-migration` | `We couldn't upgrade one of your names. Try again.` | `approved-copy` | Notion | T-FAIL |
| `name-is-locked`; `frozen-token-approval` | `One of your names can't be upgraded right now. Contact support if this keeps happening.` | `approved-copy` | Notion | T-FAIL |
| `parent-not-upgraded` | `Upgrade the parent name first, then its subnames.` | `approved-copy` | Notion + narrow `ParentNotMigrated` typed route | T-FAIL |
| `generic` with `{error}` | `Your wallet reported: {error}` | `approved-copy` | D5 exact accepted-risk wording; no taxonomy change | T-FAIL, C-PO |
| action | `Back` | `approved-copy` | Notion “Keep” | T-FAIL |
| default retry action | `Try again` | `approved-copy` | Notion | T-FAIL |
| cleanup action | `Remove temporary access` | `approved-copy` | Notion | T-FAIL |

`decodeMigrationError.ts:5-27,112-196,294-330` preserves all prior routes and includes only the cited narrow `ParentNotMigrated` → `parent-not-upgraded` route. Its executable decoder test owns the typed mapping.

## Cited completion copy

| Source/state | Approved result | Disposition | Authority/reason | Validation owner |
|---|---|---|---|---|
| `MigrationSuccessDialog.tsx:70-80`, plain one | `Your name has been upgraded!` | `approved-copy` | Notion “Keep” | T-SUCCESS, C-PO |
| same, plain many | `Your names have been upgraded!` | `approved-copy` | Notion “Keep” | T-SUCCESS, C-PO |
| same `:83`, support | `Manage your newly upgraded names from the dashboard.` | `approved-copy` | Notion §5G | T-SUCCESS, C-PO |
| same `:89`, action | `Go to dashboard` | `approved-copy` | Notion §5G | T-SUCCESS, C-PO |
| same `:31-51`, NFT migration one/many | `Your name has been upgraded!` / `Your names have been upgraded!` | `approved-copy` | D8 resolves cited literal `name(s)` conflict | T-SUCCESS, C-PO |

## Out-of-scope user-visible text — no change

The following inventory is exhaustive for migration entry, selection, progress banner, NFT information/success, and accessible labels not cited above. Rows use `excluded` only for the exact §6 surfaces the plan names; all other user-visible text is `uncited-no-change`. Validation is **D-ALLOW**, with **C-PO** where Lingui-owned.

| Source/render surface | Current-main text/templates and branches | Disposition / reason |
|---|---|---|
| `MigrationModal.tsx:48-97`, shell | `Close`; `Welcome to the new ENS app!` | `uncited-no-change` |
| same, one/many intro and eligibility | `Upgrade your name(s) in just a couple steps to unlock your new ENS profile.` with optional `and claim your personalized NFT.`; `You have {eligibleNameCount} names that are eligible for upgrade` | `excluded` — exact §6 entry-modal surfaces |
| `UpgradeBanner.tsx:67-112`, profile entry/shell | `This name can’t be edited`; `Welcome to the new ENS app`; profile `Upgrade your name to edit your new ENS profile.` with optional NFT suffix; `See what's new` | `uncited-no-change` |
| same, dashboard one/many body | `Upgrade your name(s) to unlock your new ENS profile.` with optional NFT suffix | `excluded` — exact §6 dashboard-banner surface |
| `UpgradeNamesButton.tsx:28` | `Upgrade Names` | `uncited-no-change` |
| `MigrationProgressBanner.tsx:34-76` | `{migrated} out of {total} names upgraded`; `You're almost there!`; `Complete upgrade and receive a collectible marking your place in ENS history.` / `Complete upgrade to unlock your new ENS profile.`; `Complete Upgrade` | `uncited-no-change` |
| `SelectNamesStep.tsx:101-106`, ordinary heading | `Your names are ready to upgrade` | `uncited-no-change` |
| `SelectNamesStepSelectionOptions.tsx:18-151`, controls | `All {visibleCount} eligible names selected`; `{totalSelected} out of {visibleCount} eligible names selected`; accessible/placeholder `Search names`; `Deselect all`; `Select all` | `uncited-no-change` |
| same, migration helper | `Your names, text records, and addresses will be carried over during the upgrade` | `excluded` — exact §6 helper surface |
| `SelectNamesStepNameList.tsx:123-130`; `NameRow.tsx:83-96`, visible/accessibility text | `No names match your search`; `No eligible names found for this wallet`; dynamic `{name}` visible text, `aria-label`, and `title` | `uncited-no-change` |
| `NameRow.tsx:88`, avatar | empty `alt` | `technical/non-user-facing` — decorative image |
| `SelectNamesStepFooter.tsx:136-145` | `Upgrade all names to receive NFT` | `uncited-no-change` |
| `migrationValueProps.ts:17-59`; media/cards | `Custom profiles`; `Track your favorite names`; `Keep your names safe with notifications`; `Manage everything in one place`; `Personalized NFT`; accessible media labels `Custom profiles card`, `Track your favorite names animation`, `Notifications animation`, `Manage everything in one place card`, `Personalized NFT card`; each slide label is also its control label | `uncited-no-change` |
| `MigrationValuePropsCarousel.tsx`, section label | `Migration value propositions` | `excluded` — exact §6 accessibility surface |
| `MigrationNftInfoPage.tsx:15-215`, named §6 copy | `Each eligible wallet address can claim one personalized NFT. Upgrading more names later does not create another NFT.`; `Offered after your first upgrade`; `You can preview your personalized NFT after upgrading your first name, claim it immediately, or return from your Dashboard or ENS profile later.` | `excluded` — exact §6 NFT-info surfaces |
| same, remaining page copy | `Frozen June 1 snapshot`; snapshot body; `One NFT per address`; `Back to Dashboard`; `This page could not be loaded. Please try again.`; `Try again`; accessible `Loading`; `ENSv2 commemorative NFT`; `A marker for the move to a new era of ENS.`; optional-art body; `Why might I be ineligible?`; frozen-list body; `Go to dashboard` | `uncited-no-change` |
| `MigrationSuccessDialog.tsx:43-244`, NFT/mint-later states beyond cited completion | `Your ENSv2 moment is waiting`; `Here's a gift to celebrate your upgrade to the next era of ENS`; congratulation/personalized-NFT body; dynamic `{state.message}`; `Try again`; `Continue to profile`; `Mint`; `Later`; `Minting…`; `Keep this window open while the transaction confirms.`; `Your new profile is ready.`; `Go make it yours`; `Close` | `uncited-no-change`; dynamic state messages separately inventoried below |
| `CommemorativeNftClaimDialog.tsx:55-62`, one/many completion heading | same catalog ID as cited completion | `approved-copy` — cited above |
| same `:63-102`, remaining claim UI | `Your account`; `Checking your account…`; reconnect-owner/offline/account-check sentences; `Try again`; `Go to dashboard`; `Close` | `uncited-no-change` in this render context |
| `CommemorativeNftCard.tsx:78-252` | `NFT actions`; `Share on X`; `Share on Telegram`; `View on OpenSea`; `Copy link`; `Download WebP`; `Loading NFT artwork…`; `Artwork could not be loaded.`; `Retry artwork`; `Loading NFT details…`; accessible `Commemorative ENS NFT for {rendererName}` | `uncited-no-change`; `{rendererName}` preserved |
| `CommemorativeNftRendererSurface.tsx:31-112` | `Artwork could not be loaded.`; `Loading NFT artwork…`; iframe titles `Interactive commemorative NFT artwork for {rendererName}` / `Commemorative NFT artwork for {rendererName}`; `Play artwork` | `uncited-no-change`; `{rendererName}` preserved |
| `CommemorativeNftDashboardPrompt.tsx:53-73` | `Your ENSv2 commemorative NFT is ready`; preview/mint sentence; `View and mint` | `uncited-no-change` |
| `CommemorativeNftProfileSection.tsx:72-111` | `ENSv2 commemorative NFT`; `Minted` / `Ready`; card-ready/gas sentence; `Preview and mint` | `uncited-no-change` |
| `CommemorativeNftDashboardSection.tsx:20-30` | `Welcome to ENSv2` | `uncited-no-change` |
| `useCommemorativeNftFlow.ts:75-101,170-189`, dynamic success-dialog messages | `Eligibility could not be loaded. Please try again.`; `The commemorative NFT preview is not available yet.`; `The commemorative NFT feature is disabled.`; `The eligible owner wallet is not connected.`; `This preview is display-only.`; arbitrary `{eligibilityError.message}` / `{claimError.message}` | `uncited-no-change`; these can populate `{state.message}` |
| `commemorative-nft/contract.ts:55-169`, dynamic success-dialog messages | `The mint request was cancelled.`; `This commemorative NFT has already been minted.`; `The eligibility proof could not be verified.`; `The commemorative NFT could not be minted. Please try again.`; `The commemorative NFT is not available on this network.`; `Reconnect the eligible owner wallet before minting.`; `The mint transaction reverted. Please try again.` | `uncited-no-change`; these can populate `{state.message}` |
| `MigrationPage.tsx:316`, select back accessible label | `Back` (`aria-label` and visible text) | `approved-copy` already owned by T-FAIL; listed here to account for both render sites |
| `GameStep.tsx:176-371` images | empty `alt` on decorative characters | `technical/non-user-facing` |
| `GameStep.tsx:343-356`, step counter | `{displayStep}/{totalSteps}` | `uncited-no-change`; both count placeholders preserved |
| `NameRow.tsx:49-96`, missing-label fallback | `?` | `uncited-no-change`; dynamic display fallback |
| `MigrationNftInfoPage.tsx:73`, load status | accessible label `Loading` | `uncited-no-change` |

The exact long NFT-info paragraphs remain in source/catalog and are represented by their named row above; no shortening or wording normalization is authorized. The active English catalog contains 143 message IDs referenced by `src/features/migration`; each maps to either a cited table row or an uncited row in this section. Shared IDs such as `Back`, `Close`, `Try again`, and the completion plural are classified by their migration source/render context, not globally across unrelated features.

### Full active English catalog manifest (143/143)

This generated manifest is the one-to-one reconciliation surface for **every active English `msgid`** whose source reference is under `src/features/migration/`. Source line numbers are intentionally omitted because extraction rewrites them; source files and exact IDs are stable. Detailed evidence, wording decisions, placeholder meanings, and owner reasoning remain in the primary tables above. `approved-copy` includes source-approved text deliberately preserved as well as text changed by WEB-1481; `excluded` is reserved for the exact §6 surfaces the report explicitly names; all other uncited copy is `uncited-no-change`.

| Source context | Exact active English `msgid` | Classification |
|---|---|---|
| `src/components/GlobalBackButton.tsx`<br>`src/features/bulk-renew/components/FailureStep.tsx`<br>`src/features/migration/pages/MigrationPage.tsx`<br>`src/features/notifications/settings/email-verify-step.tsx` | `Back` | `approved-copy` |
| `src/components/ui/dialog.tsx`<br>`src/features/migration/components/MigrationModal.tsx`<br>`src/features/migration/components/MigrationSuccessDialog.tsx`<br>`src/features/migration/components/success/CommemorativeNftClaimDialog.tsx`<br>`src/features/renew/components/ThirdPartyRenewalDialog.tsx` | `Close` | `uncited-no-change` |
| `src/features/bulk-renew/components/FailureStep.tsx`<br>`src/features/migration/components/MigrationSuccessDialog.tsx`<br>`src/features/migration/components/success/CommemorativeNftClaimDialog.tsx`<br>`src/features/migration/pages/MigrationNftInfoPage.tsx`<br>`src/features/migration/pages/MigrationPage.tsx`<br>`src/features/renew/workflow/components/RenewalRouteError.tsx` | `Try again` | `approved-copy` |
| `src/features/dashboard/components/NamesTable.tsx`<br>`src/features/migration/components/SelectNamesStepSelectionOptions.tsx`<br>`src/features/profile/components/view/AddressProfileNamesList.tsx` | `Select all` | `uncited-no-change` |
| `src/features/migration/components/GameStep.tsx` | `Approve restoring your managers in your wallet` | `approved-copy` |
| `src/features/migration/components/GameStep.tsx` | `Approve the temporary account in your wallet` | `approved-copy` |
| `src/features/migration/components/GameStep.tsx` | `Approve this name in your wallet` | `approved-copy` |
| `src/features/migration/components/GameStep.tsx` | `Getting ready...` | `approved-copy` |
| `src/features/migration/components/GameStep.tsx` | `Removing temporary access` | `approved-copy` |
| `src/features/migration/components/GameStep.tsx` | `Setting things up` | `approved-copy` |
| `src/features/migration/components/GameStep.tsx` | `{0, plural, one {Upgrading your name...} other {Upgrading your names...}}` | `approved-copy` |
| `src/features/migration/components/GameStep.tsx` | `{count, plural, one {Upgrading # name...} other {Upgrading # names...}}` | `approved-copy` |
| `src/features/migration/components/GameStep.tsx` | `{count, plural, one {Upgrading batch {0} of {total} (# name)...} other {Upgrading batch {1} of {total} (# names)...}}` | `approved-copy` |
| `src/features/migration/components/MigrationModal.tsx` | `Welcome to the new ENS app!` | `uncited-no-change` |
| `src/features/migration/components/MigrationModal.tsx` | `You have <0>{eligibleNameCount}</0> names that are eligible for upgrade` | `excluded` |
| `src/features/migration/components/MigrationModal.tsx` | `{eligibleNameCount, plural, one {Upgrade your name in just a couple steps to unlock your new ENS profile and claim your personalized NFT.} other {Upgrade your names in just a couple steps to unlock your new ENS profile and claim your personalized NFT.}}` | `excluded` |
| `src/features/migration/components/MigrationModal.tsx` | `{eligibleNameCount, plural, one {Upgrade your name in just a couple steps to unlock your new ENS profile.} other {Upgrade your names in just a couple steps to unlock your new ENS profile.}}` | `excluded` |
| `src/features/migration/components/MigrationProgressBanner.tsx` | `Complete Upgrade` | `uncited-no-change` |
| `src/features/migration/components/MigrationProgressBanner.tsx` | `Complete upgrade and receive a collectible marking your place in ENS history.` | `uncited-no-change` |
| `src/features/migration/components/MigrationProgressBanner.tsx` | `Complete upgrade to unlock your new ENS profile.` | `uncited-no-change` |
| `src/features/migration/components/MigrationProgressBanner.tsx` | `You're almost there!` | `uncited-no-change` |
| `src/features/migration/components/MigrationProgressBanner.tsx` | `{migrated} out of {total} names upgraded` | `uncited-no-change` |
| `src/features/migration/components/MigrationSuccessDialog.tsx` | `Congratulations, you're among the first on ENSv2. This personalized NFT marks the moment.` | `uncited-no-change` |
| `src/features/migration/components/MigrationSuccessDialog.tsx` | `Continue to profile` | `uncited-no-change` |
| `src/features/migration/components/MigrationSuccessDialog.tsx` | `Go make it yours` | `uncited-no-change` |
| `src/features/migration/components/MigrationSuccessDialog.tsx`<br>`src/features/migration/components/success/CommemorativeNftClaimDialog.tsx`<br>`src/features/migration/pages/MigrationNftInfoPage.tsx` | `Go to dashboard` | `approved-copy` |
| `src/features/migration/components/MigrationSuccessDialog.tsx` | `Here's a gift to celebrate your upgrade to the next era of ENS` | `uncited-no-change` |
| `src/features/migration/components/MigrationSuccessDialog.tsx` | `Keep this window open while the transaction confirms.` | `uncited-no-change` |
| `src/features/migration/components/MigrationSuccessDialog.tsx` | `Later` | `uncited-no-change` |
| `src/features/migration/components/MigrationSuccessDialog.tsx` | `Manage your newly upgraded names from the dashboard.` | `approved-copy` |
| `src/features/migration/components/MigrationSuccessDialog.tsx` | `Mint` | `uncited-no-change` |
| `src/features/migration/components/MigrationSuccessDialog.tsx` | `Minting…` | `uncited-no-change` |
| `src/features/migration/components/MigrationSuccessDialog.tsx` | `Your ENSv2 moment is waiting` | `uncited-no-change` |
| `src/features/migration/components/MigrationSuccessDialog.tsx` | `Your new profile is ready.` | `uncited-no-change` |
| `src/features/migration/components/MigrationSuccessDialog.tsx`<br>`src/features/migration/components/success/CommemorativeNftClaimDialog.tsx` | `{migratedNameCount, plural, one {Your name has been upgraded!} other {Your names have been upgraded!}}` | `approved-copy` |
| `src/features/migration/components/SelectNamesStep.tsx` | `Nothing has been lost. Contact ENS support before trying again.` | `approved-copy` |
| `src/features/migration/components/SelectNamesStep.tsx` | `Something about your names changed since you last tried, so we can't safely pick up where you left off.` | `approved-copy` |
| `src/features/migration/components/SelectNamesStep.tsx` | `Your names are ready to upgrade` | `uncited-no-change` |
| `src/features/migration/components/SelectNamesStep.tsx` | `Your saved upgrade needs attention` | `approved-copy` |
| `src/features/migration/components/SelectNamesStepFooter.tsx` | `Couldn't estimate the network fee` | `approved-copy` |
| `src/features/migration/components/SelectNamesStepFooter.tsx` | `Estimated network fee: <0>~{0} ETH</0>. You'll approve <1><2/>.</1><3/>Your wallet shows the final fee before you approve.` | `approved-copy` |
| `src/features/migration/components/SelectNamesStepFooter.tsx` | `Estimating the network fee...` | `approved-copy` |
| `src/features/migration/components/SelectNamesStepFooter.tsx` | `Estimating...` | `approved-copy` |
| `src/features/migration/components/SelectNamesStepFooter.tsx` | `Getting your wallet ready...` | `approved-copy` |
| `src/features/migration/components/SelectNamesStepFooter.tsx` | `Preparing wallet...` | `approved-copy` |
| `src/features/migration/components/SelectNamesStepFooter.tsx` | `Starting...` | `approved-copy` |
| `src/features/migration/components/SelectNamesStepFooter.tsx` | `Upgrade all names to receive NFT` | `uncited-no-change` |
| `src/features/migration/components/SelectNamesStepFooter.tsx` | `{totalSelected, plural, one {Upgrade # name} other {Upgrade # names}}` | `approved-copy` |
| `src/features/migration/components/SelectNamesStepNameList.tsx` | `No eligible names found for this wallet` | `uncited-no-change` |
| `src/features/migration/components/SelectNamesStepNameList.tsx` | `No names match your search` | `uncited-no-change` |
| `src/features/migration/components/SelectNamesStepSelectionOptions.tsx` | `<0>All </0><1>{visibleCount}</1><2> eligible names selected</2>` | `uncited-no-change` |
| `src/features/migration/components/SelectNamesStepSelectionOptions.tsx` | `<0>{totalSelected}</0><1> out of </1><2>{visibleCount}</2><3> eligible names selected</3>` | `uncited-no-change` |
| `src/features/migration/components/SelectNamesStepSelectionOptions.tsx` | `Deselect all` | `uncited-no-change` |
| `src/features/migration/components/SelectNamesStepSelectionOptions.tsx`<br>`src/features/profile/components/view/AddressProfileNamesList.tsx` | `Search names` | `uncited-no-change` |
| `src/features/migration/components/SelectNamesStepSelectionOptions.tsx` | `Your names, text records, and addresses will be carried over during the upgrade` | `excluded` |
| `src/features/migration/components/UpgradeBanner.tsx` | `See what's new` | `uncited-no-change` |
| `src/features/migration/components/UpgradeBanner.tsx` | `This name can’t be edited` | `uncited-no-change` |
| `src/features/migration/components/UpgradeBanner.tsx` | `Upgrade your name to edit your new ENS profile and claim your personalized NFT.` | `uncited-no-change` |
| `src/features/migration/components/UpgradeBanner.tsx` | `Upgrade your name to edit your new ENS profile.` | `uncited-no-change` |
| `src/features/migration/components/UpgradeBanner.tsx` | `Welcome to the new ENS app` | `uncited-no-change` |
| `src/features/migration/components/UpgradeBanner.tsx` | `{0, plural, one {Upgrade your name to unlock your new ENS profile and claim your personalized NFT.} other {Upgrade your names to unlock your new ENS profile and claim your personalized NFT.}}` | `excluded` |
| `src/features/migration/components/UpgradeBanner.tsx` | `{0, plural, one {Upgrade your name to unlock your new ENS profile.} other {Upgrade your names to unlock your new ENS profile.}}` | `excluded` |
| `src/features/migration/components/UpgradeNamesButton.tsx` | `Upgrade Names` | `uncited-no-change` |
| `src/features/migration/components/WalletConfirmationStepsDialog.tsx` | `Allow this temporary account to move this name.` | `approved-copy` |
| `src/features/migration/components/WalletConfirmationStepsDialog.tsx` | `Approve registration` | `approved-copy` |
| `src/features/migration/components/WalletConfirmationStepsDialog.tsx` | `Approve your names` | `uncited-no-change` |
| `src/features/migration/components/WalletConfirmationStepsDialog.tsx` | `Approve your wrapped names` | `approved-copy` |
| `src/features/migration/components/WalletConfirmationStepsDialog.tsx` | `Approve {name}` | `approved-copy` |
| `src/features/migration/components/WalletConfirmationStepsDialog.tsx` | `Creates a temporary account to carry out the upgrade for you.` | `approved-copy` |
| `src/features/migration/components/WalletConfirmationStepsDialog.tsx` | `Keep the same managers on your names after the upgrade.` | `approved-copy` |
| `src/features/migration/components/WalletConfirmationStepsDialog.tsx` | `Let this temporary account move your wrapped names.` | `approved-copy` |
| `src/features/migration/components/WalletConfirmationStepsDialog.tsx` | `One approval covers all the .eth names you selected.` | `approved-copy` |
| `src/features/migration/components/WalletConfirmationStepsDialog.tsx`<br>`src/features/migration/pages/MigrationPage.tsx` | `Remove temporary access` | `approved-copy` |
| `src/features/migration/components/WalletConfirmationStepsDialog.tsx` | `Remove the temporary permission after the upgrade.` | `approved-copy` |
| `src/features/migration/components/WalletConfirmationStepsDialog.tsx` | `Restore your managers` | `approved-copy` |
| `src/features/migration/components/WalletConfirmationStepsDialog.tsx` | `Set up temporary access` | `approved-copy` |
| `src/features/migration/components/WalletConfirmationStepsDialog.tsx` | `Upgrade batch {0} of {total}` | `approved-copy` |
| `src/features/migration/components/WalletConfirmationStepsDialog.tsx` | `Upgrade your names and bring their records across.` | `approved-copy` |
| `src/features/migration/components/WalletConfirmationStepsDialog.tsx` | `What you'll approve` | `approved-copy` |
| `src/features/migration/components/WalletConfirmationStepsDialog.tsx` | `Your names are upgraded in a single transaction. If any part of it fails, nothing changes. Nothing is signed automatically, so review every request in your wallet.` | `approved-copy` |
| `src/features/migration/components/WalletConfirmationStepsDialog.tsx` | `{0, plural, one {# request} other {# requests}}` | `approved-copy` |
| `src/features/migration/components/WalletConfirmationStepsDialog.tsx` | `{0, plural, one {Your wallet will show one request.} other {Your wallet will show # requests in this order.}}` | `approved-copy` |
| `src/features/migration/components/WalletConfirmationStepsDialog.tsx` | `{count, plural, one {Approve # name} other {Approve # names}}` | `approved-copy` |
| `src/features/migration/components/WalletConfirmationStepsDialog.tsx` | `{count, plural, one {Upgrade # name} other {Upgrade # names}}` | `approved-copy` |
| `src/features/migration/components/success/CommemorativeNftCard.tsx`<br>`src/features/migration/components/success/CommemorativeNftRendererSurface.tsx` | `Artwork could not be loaded.` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftCard.tsx` | `Copy link` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftCard.tsx` | `Download WebP` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftCard.tsx`<br>`src/features/migration/components/success/CommemorativeNftRendererSurface.tsx` | `Loading NFT artwork…` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftCard.tsx` | `Loading NFT details…` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftCard.tsx` | `NFT actions` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftCard.tsx` | `Retry artwork` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftCard.tsx` | `Share on Telegram` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftCard.tsx` | `Share on X` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftCard.tsx` | `View on OpenSea` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftClaimDialog.tsx` | `Checking your account…` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftClaimDialog.tsx` | `Reconnect to the internet to continue.` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftClaimDialog.tsx` | `Reconnect your owner wallet to continue.` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftClaimDialog.tsx` | `Your account` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftClaimDialog.tsx` | `Your account could not be checked. Please try again.` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftDashboardPrompt.tsx` | `Preview your one-of-a-kind card and mint it whenever you're ready.` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftDashboardPrompt.tsx` | `View and mint` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftDashboardPrompt.tsx` | `Your ENSv2 commemorative NFT is ready` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftDashboardSection.tsx` | `Welcome to ENSv2` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftProfileSection.tsx`<br>`src/features/migration/pages/MigrationNftInfoPage.tsx` | `ENSv2 commemorative NFT` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftProfileSection.tsx` | `Minted` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftProfileSection.tsx` | `Preview and mint` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftProfileSection.tsx` | `Ready` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftProfileSection.tsx` | `Your card is ready to preview. Minting is optional and you pay the network gas.` | `uncited-no-change` |
| `src/features/migration/components/success/CommemorativeNftRendererSurface.tsx` | `Play artwork` | `uncited-no-change` |
| `src/features/migration/components/value-props/MigrationValuePropsCarousel.tsx` | `Migration value propositions` | `excluded` |
| `src/features/migration/components/value-props/migrationValueProps.ts` | `Custom profiles` | `uncited-no-change` |
| `src/features/migration/components/value-props/migrationValueProps.ts` | `Keep your names safe with notifications` | `uncited-no-change` |
| `src/features/migration/components/value-props/migrationValueProps.ts` | `Manage everything in one place` | `uncited-no-change` |
| `src/features/migration/components/value-props/migrationValueProps.ts` | `Personalized NFT` | `uncited-no-change` |
| `src/features/migration/components/value-props/migrationValueProps.ts` | `Track your favorite names` | `uncited-no-change` |
| `src/features/migration/pages/MigrationNftInfoPage.tsx` | `A marker for the move to a new era of ENS.` | `uncited-no-change` |
| `src/features/migration/pages/MigrationNftInfoPage.tsx` | `Back to Dashboard` | `uncited-no-change` |
| `src/features/migration/pages/MigrationNftInfoPage.tsx` | `Each eligible wallet address can claim one personalized NFT. Upgrading more names later does not create another NFT.` | `excluded` |
| `src/features/migration/pages/MigrationNftInfoPage.tsx` | `Eligibility comes from a fixed snapshot of ENS holders. Names acquired after the snapshot do not change eligibility.` | `uncited-no-change` |
| `src/features/migration/pages/MigrationNftInfoPage.tsx` | `Frozen June 1 snapshot` | `uncited-no-change` |
| `src/features/migration/pages/MigrationNftInfoPage.tsx` | `Offered after your first upgrade` | `excluded` |
| `src/features/migration/pages/MigrationNftInfoPage.tsx` | `One NFT per address` | `uncited-no-change` |
| `src/features/migration/pages/MigrationNftInfoPage.tsx` | `The commemorative NFT is optional, one-of-a-kind generative art for addresses included in the ENS holder snapshot.` | `uncited-no-change` |
| `src/features/migration/pages/MigrationNftInfoPage.tsx` | `The contract checks membership in the June 1 address snapshot, not the names currently in your wallet. A later transfer or a different connected EOA does not alter that frozen list.` | `uncited-no-change` |
| `src/features/migration/pages/MigrationNftInfoPage.tsx` | `This page could not be loaded. Please try again.` | `uncited-no-change` |
| `src/features/migration/pages/MigrationNftInfoPage.tsx` | `Why might I be ineligible?` | `uncited-no-change` |
| `src/features/migration/pages/MigrationNftInfoPage.tsx` | `You can preview your personalized NFT after upgrading your first name, claim it immediately, or return from your Dashboard or ENS profile later.` | `excluded` |
| `src/features/migration/pages/MigrationPage.tsx` | `A permission is missing. Try again.` | `approved-copy` |
| `src/features/migration/pages/MigrationPage.tsx` | `One of your names can't be upgraded right now. Contact support if this keeps happening.` | `approved-copy` |
| `src/features/migration/pages/MigrationPage.tsx` | `One of your names changed owners. Refresh and select it again.` | `approved-copy` |
| `src/features/migration/pages/MigrationPage.tsx` | `Something went wrong. Refresh and try again.` | `approved-copy` |
| `src/features/migration/pages/MigrationPage.tsx` | `This is taking longer than expected.` | `approved-copy` |
| `src/features/migration/pages/MigrationPage.tsx` | `This wasn't set up with the wallet you're using now. Connect the original wallet.` | `approved-copy` |
| `src/features/migration/pages/MigrationPage.tsx` | `Upgrade didn't finish` | `approved-copy` |
| `src/features/migration/pages/MigrationPage.tsx` | `Upgrade the parent name first, then its subnames.` | `approved-copy` |
| `src/features/migration/pages/MigrationPage.tsx` | `We couldn't read your current records.` | `approved-copy` |
| `src/features/migration/pages/MigrationPage.tsx` | `We couldn't safely retry. Nothing was submitted and nothing changed.` | `approved-copy` |
| `src/features/migration/pages/MigrationPage.tsx` | `We couldn't upgrade one of your names. Try again.` | `approved-copy` |
| `src/features/migration/pages/MigrationPage.tsx` | `You cancelled the request.` | `approved-copy` |
| `src/features/migration/pages/MigrationPage.tsx` | `Your permissions changed. Go back to check the updated estimate.` | `approved-copy` |
| `src/features/migration/pages/MigrationPage.tsx` | `Your wallet reported: {0}` | `approved-copy` |
| `src/features/migration/pages/MigrationPage.tsx` | `{0, plural, one {Your name is safe.} other {Your names are safe.}}` | `approved-copy` |
| `src/features/migration/pages/MigrationPage.tsx` | `{selectedNameCount, plural, one {Your name was upgraded. One thing left: a temporary permission on your name still needs to be removed.} other {Your names were upgraded. One thing left: a temporary permission on your names still needs to be removed.}}` | `approved-copy` |

Classification totals: **61 `approved-copy` + 72 `uncited-no-change` + 10 `excluded` = 143 active IDs.**

## Service prose and technical exclusions

| Source/boundary | Accounted values | Disposition | Reason / validation owner |
|---|---|---|---|
| `migrationService.ts`, runtime descriptions | Every end-user progress/recovery literal is in the cited runtime tables | `approved-copy` | T-SERVICE; remains plain English `description: string` per D9 |
| `migrationService.ts` wrapped-step/internal errors | `Setting up HCA`; `Reconciling previous atomic migration`; preview-drift and cleanup exception messages; transaction `reverted (tx {hash})` | `technical/non-user-facing` | Diagnostic/error-chain prose, not an independent approved UI slot; any generic exposure is represented by D5 `{error}`. R-TECH |
| `useMigrationGasEstimate.ts` thrown query errors | wallet/setup, stale-selection, and estimate internals | `technical/non-user-facing` | Query failures collapse to approved fee error; only `{accountError}` is displayed. R-TECH |
| `decodeMigrationError.ts` types and decoder | `MigrationError` discriminants, ABI/custom error names, extraction fallback | `technical/non-user-facing` | Routing taxonomy frozen except existing narrow parent route; UI outputs are fully listed above. T-FAIL/R-TECH |
| `contracts/abis.ts`, migration contract/service files | Solidity error/function names, HCA/migration/atomic identifiers, addresses, calls, journal keys | `technical/non-user-facing` | Protocol and source symbols explicitly excluded. R-TECH |
| `migrationUi.machine.ts`, context/selectors | state/event keys, `MigrationProgress`, `/migration` route wiring | `technical/non-user-facing` | XState/transport behavior frozen. R-TECH |
| logs/comments/docs/fixtures/tests | source comments, logger strings, operator docs, fixture errors, test labels | `technical/non-user-facing` | Not rendered product copy. R-TECH |
| Storybook-only preview controls | `Open preview` and story names | `technical/non-user-facing` | QA harness only, not shipped in the app. V-COPY |
| English PO obsolete history | old marker, footer, retry, generic, saved-state, literal `name(s)`, reassurance, cleanup, and fallback IDs | `technical/non-user-facing` | Lingui's unchanged PO formatter retains removed IDs as obsolete history; no active render. C-PO |
| stale current-main catalog ID | `Mint commemorative NFT` becomes obsolete during normal extraction | `technical/non-user-facing` | No current source reference; extraction reconciliation, not new product copy. C-PO |
| Swedish PO generated entries | same new/obsolete IDs, empty `msgstr` for new English messages | `technical/non-user-facing` | Generated by unchanged extraction; no Swedish wording was authored/reviewed under D9. C-PO |

## Source → ledger → render → catalog → diff reconciliation

### Active catalog additions/changes explained

- New count messages: standing reassurance and cleanup one/many.
- New active messages: `Approve registration`; saved-state ASCII sentence and support; exact D4 retry; D2 footer; D5 generic prefix.
- Removed/obsolete active messages: `Approve this name`; #1158 per-batch footer; recovery lead-in; curly-apostrophe saved sentence and old support; `Upgrade details`; #1158 retry alternative; literal NFT `name(s)`; plural-only reassurance; plural-only cleanup.
- `Mint commemorative NFT` was already absent from current source and is obsoleted by the normal extraction pass; it is the sole stale current-main catalog reconciliation unrelated to a source edit in this branch.
- Service runtime/recovery prose is intentionally outside Lingui and reconciled by T-SERVICE instead.
- Placeholder inventory is complete: `{name}`, `{count}`, `{migratedCount}`, `{copiedCount}`, `{batchNumber}`, `{total}`, `{amount}`, `{accountError}`, raw `{error}`, `{selectedNameCount}`, `{migratedNameCount}`, `{eligibleNameCount}`, `{visibleCount}`, `{totalSelected}`, `{migrated}`, and dynamic `{rendererName}`/`{state.message}`.

### Exact final diff allowlist and plan mapping

This is the complete approved branch diff. The ledger is the **only** documentation change; no product-copy scope is introduced by documentation.

| Exact changed path (under `apps/manager/`) | Kind | Approved-plan mapping |
|---|---|---|
| `src/features/migration/components/GameStep.tsx` | source | D6: remove only #1158's excluded recovery lead-in render |
| `src/features/migration/service/migrationService.ts` | source | D6: remove only #1158's excluded `isRecovering` transport metadata; preserve transaction behavior/order |
| `src/features/migration/pages/MigrationPage.tsx` | source | D3-D5/D8: count-aware reassurance/cleanup, exact retry and generic prefix; no taxonomy expansion |
| `src/features/migration/components/SelectNamesStep.tsx` | source | §5F/R4: exact two saved-state paragraph replacements |
| `src/features/migration/components/MigrationSuccessDialog.tsx` | source | D8: cited NFT completion heading one/many branch |
| `src/features/migration/components/WalletConfirmationStepsDialog.tsx` | source | §5H/D2: restore cited kept fallback and exact accepted-risk footer |
| `src/features/migration/components/GameStep.test.tsx` | test | T-GAME: heading/fallback/recovery-slot/D6 regression lock |
| `src/features/migration/service/migrationService.test.ts` | test | T-SERVICE: all runtime/recovery descriptions and unchanged event shape/order |
| `src/features/migration/pages/MigrationPage.test.tsx` | test | T-FAIL: all failure families, one/many reassurance/cleanup, generic raw error, actions |
| `src/features/migration/components/SelectNamesStep.test.tsx` | test | T-SELECT: saved-state exact copy plus fee/CTA rendering coverage |
| `src/features/migration/components/MigrationSuccessDialog.test.tsx` | test | T-SUCCESS: plain/NFT completion one/many and fallback/action copy |
| `src/features/migration/components/WalletConfirmationStepsDialog.test.tsx` | test | T-WALLET: every descriptor branch, counts, footer, open/close/focus behavior |
| `src/features/migration/components/MigrationCopy.stories.tsx` | story | V-COPY: deterministic progress, fee, wallet, generic/retry/cleanup/parent failure surfaces |
| `src/features/migration/components/MigrationSuccessDialog.stories.tsx` | story | V-COPY: deterministic plain/NFT completion one/many states |
| `src/locales/en/messages.po` | generated catalog | D9/C-PO: unavoidable English IDs/obsolete markers from unchanged extraction |
| `src/locales/sv/messages.po` | generated catalog | D9/C-PO: only generated untranslated entries/obsolete markers; no Swedish translation authored |
| `docs/WEB-1481_MIGRATION_TEXT_LEDGER.md` | sole documentation | Required source→ledger→render→catalog→diff accountability and validation evidence only |

No migration modal/banner/progress-banner/selection-helper/NFT-info/value-prop/NFT mechanics, Lingui config, XState machine, decoder, transaction behavior, batching, eligibility, retry, HCA contract, gas, generic-error taxonomy, locale/framework, or other documentation file may differ. Final `git diff --name-only`, `git diff --word-diff`, active-catalog scan, Swedish `msgstr` scan, and tests own this gate.

## Final validation record

- [x] **Focused migration tests:** 8 files, 164 tests passed with no type errors. Happy DOM emitted known teardown `AbortError` noise after success; exit status was zero.
- [x] **Full Manager tests:** `TZ=UTC pnpm --filter manager test --run` passed 212 files / 2,017 tests with 1 skip and no type errors. The first run in the host's `Asia/Taipei` timezone exposed three unchanged date-sensitive tests; all three files and implementations are byte-identical to `origin/main`, and the UTC rerun used CI's configured timezone and passed.
- [x] **Types, lint, and builds:** Manager typecheck, Manager production build, Storybook build, Manager lint, and root `pnpm check` completed successfully. Biome reported only existing repository warnings; build tooling reported existing dependency/chunk annotations.
- [x] **Catalogs:** unchanged `i18n:extract` and `i18n:compile` passed. Automated reconciliation found 143 unique active English migration IDs, 143 manifest rows, zero missing exact IDs, and classifications totaling 61 `approved-copy` + 72 `uncited-no-change` + 10 `excluded`. All eight generated new Swedish entries have empty `msgstr`; no Swedish translation or locale/framework change was authored.
- [x] **Storybook/visual QA:** deterministic stories cover progress one/many/recovery/long name, selection fee one/many/error, wallet explainer, generic/retry/cleanup/parent-first failures, and plain/NFT completion one/many. `chrome-devtools-axi` reviewed the matrix at 1440×900 and emulated 375×812 (2× mobile/touch): exact copy rendered, text/body overflow scans were empty, long names wrapped, wallet content remained scrollable, close received focus, Escape closed and restored trigger focus, and representative screenshots were visually inspected.
- [x] **Manager E2E applicability:** repository Manager config explicitly ignores `/migration/` specs, and direct migration E2E requires the Anvil/mockestrator Docker stack; the local Docker daemon was unavailable. Exact environment blocker recorded rather than changing infrastructure or running unrelated E2E.
- [x] **Diff/accountability gate:** automated comparison found exactly the 17 allowlisted files above, no extras/missing paths, no other documentation, and no uncited production source diff. `git diff --check`, word-diff review, generated-catalog review, D6 absence checks, and Swedish `msgstr` scan passed.
- [x] **Current base/independence:** immediately before commit, `git fetch origin main` still resolved `origin/main`, `HEAD`, and merge-base to `eeff2f0341f45a0355f70cd785b01fe6f48b0e44`; `origin/main` is an ancestor. No #1161 commit/material was copied or cherry-picked.
