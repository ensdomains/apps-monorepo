# Migration correctness implementation plan

**Goal:** Apply the targeted migration improvements agreed in this chat.

**Design:** Preserve the existing controllers, token classification, and record-loss guard. Resolve the actual resolver for locked names from the V1 registry and on-chain PublicResolverSet before generating calls or recovery plans. Keep V1 renewal available through the inclusive 90-day boundary without changing NameWrapper's 90-day expiry offset. Offer a repair transaction only for a live V1 registration whose wrapper expiry needs syncing, then refresh eligibility.

**Constraints:** Work on `yoginth/migration-correctness`, updated to main `3452f3ea6`. Implementation was kept uncommitted until the user authorized committing, pushing, and opening a draft PR. Do not broadcast transactions or add test cases or test files. Update existing assertions where their previous behavior is intentionally corrected; use focused runtime checks, existing suites, typecheck, and lint.

## Tasks

- [x] Resolve locked-name resolvers from chain in preflight, planning, and recovery. Keep custom and empty resolvers intact; block public-resolver replacement if records cannot be copied safely. Fail closed on unreadable chain state.
- [x] Correct V1 grace selection, renewal validation, and quote boundaries to include the final second. Preserve exact NameWrapper grace offsets and V2 semantics.
- [x] Add a targeted wrapper sync action with live verification and eligibility refresh; reuse existing wallet and transaction conventions.
- [x] Review the uncommitted diff, run relevant existing checks, and report the branch, validation, and remaining scope.

## Review focus

- A resolver present only in the on-chain set must receive the record-safety guard.
- Custom resolvers absent from the set must remain unchanged.
- Recovery must resolve current chain state rather than trust stale resolver metadata.
- V1 registration expiry plus 90 days remains renewable; the next second does not.
- Wrapper repair must never renew a name, transfer it, or proceed with a reverted/unconfirmed transaction.

## Deferred scope

Copying records into shared PublicResolverV2 is a separate feature. This patch preserves the block for those names until the complete copy and verification flow exists.

## Implementation and verification

- Locked resolver reads and membership checks are batched at the same block; resolved metadata is applied to planning and re-resolved in recovery. The existing record-loss guard remains active.
- V1 renewal includes expiry plus 90 days and ends one second later. The NameWrapper offset and V2 window are unchanged.
- Live-owned stale wrappers have a targeted sync action using the transaction manager. Receipt-block expiry verification precedes eligibility refresh. Dashboard/profile/permissions/progress entry points include repairable names without making them selectable for migration before repair.
- The independent read-only review found one Important entry-point integration gap; it was fixed and verified. No Critical or Minor findings were reported.
- Final Manager suite after updating from main: 310 files, 3,385 tests passed, exit 0. Run with `TZ=UTC` and `NODE_OPTIONS=--no-experimental-webstorage` to satisfy existing calendar/storage assumptions without repository config changes.
- Shared migration suite: 6 files, 102 tests passed, exit 0.
- Manager `pnpm typecheck`: passed, exit 0.
- Biome: 46 source/test files across the incoming main commit and local patch checked, exit 0; two existing complexity warnings in graceRenewal.ts and its test helper remain.
- Focused runtime checks passed for previously unlisted public-resolver replacement, custom/empty resolver preservation, fixed-block reads, wrapper-sync calldata and receipt failures, restored eligibility, inclusive grace boundaries, and repair-only entry points.
- No new test cases or test files were added. Existing expectations/mocks were updated for the intentional behavior changes.
- No live transaction or deployment was performed. Fully expired wrappers whose owner/fuses are unavailable continue to fail closed; broader repair behavior needs deployed-contract validation.
- Fast-forwarded the branch from `481417a8a` to main `3452f3ea6` (WEB-1573 wallet record replay). The only conflict was an import list; both resolver selection and wallet-writer selection are retained. Reviewed the four overlapping files, including initial and recovery planning. All 24 files outside that overlap were restored byte-for-byte before this verification update.
- Before publication, HEAD matched main `3452f3ea6` and all 28 migration files were uncommitted and unstaged. The avatar-worker artifacts were preserved and remain excluded from this migration change.
