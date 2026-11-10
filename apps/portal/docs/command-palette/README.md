# Search and action palette prototype

The Portal has one global search and action palette. Open it with `Cmd+K` or
`Ctrl+K`, sidebar search, the mobile header search button, or the shortcut
control inside the homepage's entity search.

This is a working prototype for designer review. It uses the existing Portal
routes, editors, wallet chooser, renewal forms, role sheet, and names table.
The palette never submits transactions itself.

Built-preview captures: [desktop](desktop.png), [entity actions](entity-actions.png),
[mobile](mobile.png), and [short mobile viewport](mobile-short-viewport.png).

## Suggested demo

1. Open the palette disconnected. Search and navigation work without a wallet;
   **Connect wallet** is an explicit option.
2. Type `website` or `avatar`. Choose **Edit records**, enter a name, and select
   it. Cancel wallet connection to show that the name and search step survive.
   Back returns to the original action query, with focus ready for typing.
3. Search a complete name. Enter opens its profile. The selected row's
   **→ Actions** button or Right Arrow at the end of the query opens its
   action list, with the target shown as a chip in the input. Copy the name or
   its Portal link. View and suggested actions precede **Related** rows (owner,
   ETH address, resolver, parent name). Enter opens a related destination; Right Arrow
   on the owner continues into that address's actions.
4. Compare `renew` with `renew.eth`. The command comes first for the bare verb;
   the explicit name comes first when its suffix is supplied. `>renew` searches
   actions only. `renew example.eth` supplies an explicit target directly.
5. On a name page, open the palette to show current-name shortcuts. Choose
   another name to demonstrate that an explicit target overrides page context.
6. Connect a wallet and search `primary` or `wallet name`. The command opens
   that wallet's existing network-aware resolution interface.
7. On a names page, search the page's selection actions. Shown-row selection
   and expiry/grace presets label their scope; selection is visible on the page
   before renewal. Global **Expiring names** reaches the filtered names view.
8. Repeat lookup and action selection on mobile. Back, clear, and close remain
   separate controls. The surface follows the visual viewport when the keyboard
   reduces available height.

Use a name appropriate to the app's configured network for live management
flows. Wallet permissions, RPC/indexer availability, and the existing workflow's
validation still determine whether a particular action can continue.

## Behavior to discuss with designers

- **View stays View.** Availability adds a separate Register action; it never
  changes what Enter does on a selected name result.
- **Actions are visible.** The selected row shows its primary keyboard hint
  inline on desktop and a separate **→ Actions** button. Actions stays visible
  on touch. Hover or focus darkens that button; clicking the row still opens
  the entity. The button is a sibling of the option, avoiding nested controls.
  Right Arrow at the end of the query opens Actions. Tab and Shift+Tab move
  focus normally. The modal has no footer.
- **View stays first inside an entity.** Its action view starts with View, then
  suggested actions, then relationships. Async facts never insert a new
  destination ahead of View. Relationships use the same queries as the pages;
  Enter opens their destination and Right Arrow explores their actions. An address
  lists its primary name. On a name page, typing `owner` can surface cached
  owner information without opening its actions first; fresh relationship
  lookups wait until the entity is explicitly opened.
- **The target is explicit.** Entity-first, action-first, and current-page
  shortcuts share the same command. Route and account changes do not substitute
  another name.
- **Recovery retains intent.** Connection cancellation, failed checks, blocked
  navigation, and interrupted handoffs preserve useful state. Old async results
  cannot overwrite a newer session.
- **Known facts curate actions.** Cached availability, protocol, and name shape
  remove obvious dead ends. Feature workflows remain authoritative for actual
  permissions and transaction eligibility.
- **Developer discovery is separate.** Enabled tools appear within Developer
  tools, not mixed into ordinary matches or personal history. Existing per-tool
  flags remain in force.

The empty state, View/Register choice, contextual density, vocabulary, mobile
entry point, and optional command syntax are proposed defaults for review.

## Feedback applied from Joe

[Entry point feedback](https://enslabsworkspace.slack.com/archives/D0BEMQJKBNX/p1794332654097989):
the existing shortcut hint inside the homepage search field now opens the
palette, carrying over the query. Clicking, keyboard activation of the button,
and the global shortcut work while inline results are open. The shared dialog
guard exempts only this inline search popover; other dialogs and wallet flows
still block opening.

[Inline search feedback](https://enslabsworkspace.slack.com/archives/D0BEMQJKBNX/p1794332531043879):
the homepage retains its inline dropdown. It now opts into the focused
completion policy, a one-candidate verification limit, and the palette's
availability freshness window. Its existing full verification still recognizes
offchain names. Sharing the palette's result presentation inside that dropdown
remains a separate implementation step.

[Entity feedback](https://enslabsworkspace.slack.com/archives/D0BEMQJKBNX/p1794332174465039):
address rows reuse `EntityBadge`; resolver rows select its contract variant.
Standalone badges omit native links and hover actions, leaving navigation and
copying to the palette's own controls. They do not enable badge metadata queries.

[Permission feedback](https://enslabsworkspace.slack.com/archives/D0BEMQJKBNX/p1794332076700119)
is still outstanding. Integrate feature-owned capability adapters for an opened
entity, reusing `useCanTransfer`, `useCanEditRecords`, and the create-subname
feature's gates. Preserve unknown, denied, and allowed states; owner equality
cannot represent resolver delegates or registry roles. Global action discovery
should remain available for choosing another target. Do not run permission
queries for every search suggestion.

### Inline controls refinement

[Joe's follow-up](https://enslabsworkspace.slack.com/archives/D0BEMQJKBNX/p1794341062476689)
removes the footer and moves action labels onto the selected row. His
[agreement on Right Arrow](https://enslabsworkspace.slack.com/archives/D0BEMQJKBNX/p1794341524207709)
replaces Tab activation. Existing tests intentionally change the Tab expectation
to focus movement, rename the footer-button case to the inline-button case, and
check the secondary click target outside the option. New coverage verifies the
inline hints and footer removal. Existing primary activation, composition,
caret movement, asynchronous selection, and navigation tests remain unchanged.
This pass verifies 193 palette tests, Portal typecheck and production build,
changed-file Biome checks, and desktop/mobile pointer and keyboard behavior.

### Regression check

- Checked the provider, shortcut hook, both entity row builders, homepage search,
  and existing `EntityBadge` callers. Shared component defaults are unchanged.
- The delayed-metadata selection test now uses a real cached owned name instead
  of a generated `.box` suggestion, retaining its original selection assertion.
  This reflects the deliberate removal of speculative suffix recommendations.
- Added coverage for focused homepage results, the trigger placement, handoff
  while inline results are open, unrelated dialog blocking, resolver presentation,
  and inert entity badges. New regressions were checked against broken behavior.
  Earlier entry-point verification covered 331 tests, Portal typecheck, production
  build, and changed-file Biome checks. Desktop
  and mobile checks include live Sepolia resolver classification and both entry
  paths from the inline dropdown.

### Design notes

Homepage and palette still have separate row renderers and verification needs.
Share their presentation through a small results component while preserving each
surface's interaction model. Permission presentation belongs on the selected
entity and should consume existing feature decisions; it should not add another
command execution or authorization framework.

## Running locally

From `apps/portal`, use the existing environment configuration:

```sh
pnpm dev
```

For a stable demo without development overlays:

```sh
pnpm build
pnpm serve --host 127.0.0.1 --port 4173 --strictPort
```

Developer tooling follows [the existing environment options](../../.env.example).
The normal built preview does not need developer tools enabled. No deployment
or GitHub action is part of these commands.

## Implementation map

- [Command contract](../../src/features/command-palette/core/types.ts) and
  [catalog composition](../../src/features/command-palette/catalog.ts). Features
  contribute typed operation data and optional pure applicability predicates.
- [Pure search](../../src/features/command-palette/core/search.ts),
  [result model](../../src/features/command-palette/resultModel.ts),
  [navigation state](../../src/features/command-palette/core/state.ts), and
  [recents](../../src/features/command-palette/core/recents.ts).
- [Execution planning](../../src/features/command-palette/executionPlan.ts),
  [execution boundary](../../src/features/command-palette/executePlan.ts), and
  [one-shot handoffs](../../src/features/command-palette/handoff.ts).
- [Page registration](../../src/features/command-palette/usePageCommands.ts)
  connects mounted-page controls to the palette. Keep domain decisions in
  feature-owned pure helpers and keep the existing forms authoritative.

Rows are single-line: an icon declared by each command (or the name's avatar),
the title with the matched text in bold, and optional right-aligned meta such
as availability or a page action's disabled reason. The selected row names what
Enter does inline; its separate Actions button carries the Right Arrow hint.

The dialog keeps its input mounted outside the keyed cmdk result store. That
preserves text focus and caret state while application-owned selection remains
stable across asynchronous result changes and Back navigation. Keyboard order
matches visible group order; pointer layout changes alone do not select a row.

`navigatePalette` preflights the installed router's registered blockers because
this router version does not promptly settle a canceled navigation promise. It
supports internal, unmasked PUSH destinations. Its actual-router tests cover
cancellation, confirmation count, Unicode, and history data; retain those tests
when upgrading TanStack Router.

## Validation and review boundaries

Focused tests cover search, parsing, target precedence, history, actual dialog
interactions, wallet continuation, workflow handoffs, draft protection, bulk
selection, feature gates, and stale-session recovery. Deliberate behavior breaks
were used to confirm the new regression tests fail.

Browser checks cover the built desktop and mobile UI, actual clipboard writes,
connection cancellation, focus restoration, and a shortened mobile viewport.
Existing workflow integrations are exercised by focused tests. Browser checks
did not sign or submit transactions; physical mobile-wallet and iOS keyboard
behavior remain useful manual review cases.

Optional refinements such as focusing a particular record field and invoking
individual QA time presets are not implemented. Name, selected-address, namehash,
Portal link, and a name's resolved ETH address copying are implemented. Resolved
ETH-address copying appears in the entity view once its record is known. The
current record aliases open the editor, and developer commands open the existing
tool panels.

Original prototype checks: 366 tests across 39 affected Portal files, four developer-tool
tests, Portal/Manager/developer-tool typechecks, changed-file lint, and the
production build passed. Built desktop/mobile browser journeys completed without
page errors. Existing complexity warnings stayed at or below their original
levels.

## Interaction and request policy

Candidates are built from the current input immediately; the 250 ms debounce
controls verification, not rendering. Enter always acts on the current query's
row. A complete name or address can be opened before metadata arrives. Bare
labels complete to `.eth`. Explicit names keep their suffix: `example.com`
produces `example.com`, without `.eth` alternatives or speculative DNS suffixes.
Partial `.eth` input still completes; short explicit DNS names remain searchable.

The palette supplies `suggestionMode: focused`, `verificationLimit: 1`, and
`verificationMode: discovery` to the shared search hook. Other callers retain
their existing defaults. Search helpers and TanStack Query factories remain
shared; there is no second cache or relationship registry.

| Interaction | Palette-initiated reads |
| --- | --- |
| Closed, empty root, or `>` command search | None; cached facts and avatars can render |
| Bare label or explicit `.eth` name | After debounce: registrable availability for the leading candidate only; no owner or profile reads |
| Explicit DNS name | After debounce: current ENS records for that exact candidate; no DNSSEC suffix discovery, ownership lookup, or DNS purchase-availability check |
| Complete address | After debounce: resolver-interface detection |
| Explicitly open an entity's actions | Check the governing `.eth` registration, then load owner, ETH address, and resolver; addresses load their primary name |
| Name target picker | Existing portfolio query; recent targets are local shortcuts |
| Arrow through results or scroll | No new entity lookups |
| Retry | Only failed reads for the current search, entity relationships, or picker portfolio |

These are query boundaries, not counts of underlying RPC calls. A factory may
perform multiple contract or indexer operations, and normal app queries can
continue independently. Existing requests may finish after the input changes;
query keys keep their results attached to the old target.

Exact action phrases suppress entity reads; `>` makes intent explicit. Partial
verbs remain ambiguous and can check one name’s availability after the debounce. The optional
`renew example.eth` syntax still binds that target directly. Entity and target
selection, workflow readiness, and connection recovery keep their existing
semantics. Workflow validation remains authoritative; cached facts only curate
the palette and do not prove permission, current availability, or eligibility.

Inside an entity, View is the stable default. Common actions are suggested ahead
of technical destinations; typing searches all applicable entries. Related rows
support Enter to navigate and Right Arrow to continue exploring. The resolved
ETH-address utility copies that record, independently of the connected account.
An empty target picker offers recent entities and, for address targets, the
connected wallet. Choosing one explicitly pins the target.

Scroll positions are transient refs in `usePaletteNavigation`. They are captured
when moving between frames or recovering from a failed action, rather than
rerendering the provider for every scroll event. The existing reducer still owns
navigation state. The keyed cmdk list and mounted input remain in place because
they protect selection and caret behavior during structural result changes.

## Registration-aware relationships

The `luc.eth` report was reproduced against chain `11155111` and
`sepolia.api.bigname.sh`. Sepolia reported the name as available, while its legacy
registry still held an owner and its old resolver still held records. The old
palette treated those records as current relationships. The trace did not show
a mainnet ENS lookup; the misleading facts were returned on Sepolia itself.

`getRelationshipReadState` now distinguishes inactive, checking, available,
failed, and ready reads. A `.eth` name checks its registration first; a deeper
name checks the governing `.eth` 2LD. While that verdict is pending or failed,
the palette withholds owner, resolver, and payment-address facts. An available
registration suppresses them even if older queries contain cached legacy data.
Static parent links remain useful. DNS names can resolve offchain without a
registry owner, so they do not use the `.eth` registration gate.

Once eligible, the palette reads the existing owner, resolver, and
`getEthAddressQueryOptions` queries in parallel. It no longer fetches the full
profile inventory, text records, other coin records, contenthash, or ABI just to
find one ETH address. The ETH record uses coin 60 on the configured ENS network;
the coin identifier does not select the mainnet RPC.

Search checks registration availability for `.eth` candidates and current
resolution for explicit DNS candidates. Unchecked candidates stay navigable.
DNS results say **Found in ENS** when records resolve or **No ENS records found**
when the checked records are empty; failed reads remain verification failures.
These labels make no claim about DNS registration or purchase availability.
Existing inline search retains its full verification behavior. Palette queries
use explicit freshness: 30 seconds for search and registration checks, 60 seconds
for relationships. Fresh results are reused on reopening; stale registration is
rechecked before loading dependent relationships. These windows curate the UI;
feature workflows still perform their authoritative eligibility checks.

Relationship errors are visible and retryable. A failed read does not replace
successful relations, and a failed revalidation does not expose its cached value
as current. Registration-check failures block the dependent reads and can be
retried independently. The existing TanStack Query cache remains the only cache;
query factories retain their shared keys and default behavior for other callers.

A live desktop/mobile check of the corrected `luc.eth` journey made one Sepolia
RPC call for search, zero additional RPC calls when opening its available-name
actions, and showed no Related rows or resolved-address copy action. No page
errors were reported. Query-level tests also cover cache reuse, subnames,
ownerless DNS names, partial failures, and selective retry. Final checks passed:
236 tests across 22 affected files, changed-file lint without complexity warnings,
and the production build including Portal typecheck. Deliberate cache/retry
regressions were confirmed to fail before restoring the implementation.

Intentional test updates in this audit:

- The provider's bounded-search and search-retry tests now require zero owner
  reads, because the palette explicitly requests availability-only verification.
- The command-only test waits through debounce directly; it no longer waits for
  an owner-query observer that the palette intentionally does not create.
- The ETH-address copy test supplies its value through the narrow ETH-record
  boundary. The existing clipboard and disconnected-wallet assertions remain.

The name picker still uses the existing portfolio query when it needs uncached
wallet names. That query can page through a large portfolio; a bounded name-search
endpoint is a separate follow-up, with expired/former-owner name coverage retained.

## Focused suggestions and DNS usability

The palette no longer fabricates `.xyz`, `.box`, `.com`, or `.lol` alternatives
for a bare label. Already known matching wallet names can still appear, and
users can enter any complete DNS name or subname explicitly. There is no global
DNS suffix probe or DNS-registrar integration.

DNS verification reuses the profile query with `includeLegacyRecords: false`.
That scope reads the current resolver, including indexed record keys and
wildcard records, without falling back to historical resolver data. Its query
key includes the scope so a previously cached historical profile cannot satisfy
a current-usability check. Other profile callers keep their existing defaults;
record-save invalidation uses the name-only prefix and covers both scopes.

The record check is debounced and limited to one explicit DNS candidate. It can
read multiple records for that candidate; it does not fan out across possible
suffixes. An empty record result is an observation about the checked ENS records,
not proof that the name is absent from DNS or available to buy. Enter continues
to open the exact name, and DNS verification never creates an ENS Register row.

Regression coverage preserves existing shared-search defaults and checks exact
DNS navigation, focused completions, current-only resolution, cache isolation,
and DNS labels. Browser checks at desktop/mobile widths showed one `.eth`
completion for `helgesson` and one `example.com` row labeled **No ENS records
found**, with no page errors. The existing expanded builder's complexity warning
is unchanged at 58; the focused adapter does not add complexity to it. Final
checks passed: 315 tests across 25 affected files, Portal typecheck, production
build, and desktop/mobile browser checks. Deliberate breaks of DNS verification,
current-profile cache isolation, and result labeling were confirmed to fail.

## Design review questions

- Do View and the secondary Actions entry communicate navigation versus exploration?
- Are the suggested actions useful without implying wallet authorization?
- Should ambiguous prefixes favor actions more strongly than name candidates?
- Do exact DNS usability labels and `.eth` completion make the distinction between name search and registration clear?
- Should copying retain the entity view instead of closing the palette?

The provider still coordinates several cancellation and handoff refs. A future
rewrite should keep the pure planners and consolidate that lifecycle behind one
explicit session model if it grows further. This pass does not add a generic
execution framework, permission graph, transaction flow, or another state system.

## Validation of this iteration

Focused regressions cover immediate current-query candidates, bounded reads,
empty/current-page and command-only read suppression, cached-only avatars,
selective retry, stable entity ordering, picker shortcuts, resolved-address
copying, and scroll capture without rerendering. Deliberate implementation breaks
were used to check that regressions fail. The 272 affected tests across 27 files,
Portal typecheck, changed-file lint, and the production build passed.

Desktop (1440 × 1000), mobile (390 × 700), and short mobile (390 × 420) browser
journeys checked the command search, name-to-actions exploration, Back with focus
restoration, and viewport bounds. Command-only search initiated no observed
Ethereum RPC requests; the journeys produced no page errors. This does not
simulate a physical mobile keyboard or wallet.

Existing tests intentionally updated:

- `presentation.test.ts`: the old debounce blanking assertion is replaced because
  candidates now come from current input immediately; only verification waits.
- `resultModel.test.ts`: entity ordering now starts with View and suggested
  actions, before relationships. Its picker call follows the presentation
  helper's updated signature. Existing relation destinations remain asserted.

## Regression check

- Shared search callers: homepage/legacy inline search and the global palette.
- Renewal callers: name overview, fuse/ownership views, and the names table.
- Wallet opener: existing no-argument callers remain supported alongside the
  palette's explicit continuation API.
- Shared developer drawer: Portal, Manager, and `DevDrawerShell` preserve their
  default behavior; package and both app typechecks were checked.
- The drawer moved under the palette provider and remains inside
  `QueryClientProvider`, preserving access to the application's query cache.
- The former inline-owned shortcut test now asserts absence of a local dialog;
  the root provider suite verifies global shortcut ownership. Obsolete
  `SearchModalContent` and its tests were removed together after its final live
  caller was retired. Existing renewal assertions were retained.
- Intentional user changes: separate View/Register and address/resolver actions,
  unified sidebar search, mobile search entry, and a shared leave-page prompt for
  unsaved record edits.
