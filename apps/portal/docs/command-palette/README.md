# Search and action palette prototype

The Portal has one global search and action palette. Open it with `Cmd+K` or
`Ctrl+K`, sidebar search, the mobile header search button, or **Search actions**
below the homepage's entity search.

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
3. Search a complete name. Enter opens its profile. Tab, the selected row's
   **Actions** pill, Right Arrow, or the footer's **Actions** button opens its
   action list, with the target shown as a chip in the input. Copy the name or
   its Portal link. Its **Related** rows at the top (owner, ETH address,
   resolver, parent name) open directly, and Tab on the owner continues into that address's
   actions.
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
- **Actions are visible.** A name or address row carries its own **Actions**
  pill (shown on the selected row on desktop, on every row on touch). Tab,
  Right Arrow and the footer's **Actions** button reach the same list for
  keyboard and screen-reader users, so no interactive control sits inside an
  option. Shift+Tab, and Tab on a row without actions, move focus as usual.
- **Relations are destinations.** A name's actions start with the names and
  addresses it points at, read from the same queries as its pages. Enter on
  the first row therefore opens the owner. An address
  lists its primary name. On a name page, typing `owner` finds the current
  name's owner without opening its actions first.
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
as availability or a page action's disabled reason. The footer names what Enter
does for the selected row.

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
individual QA time presets are not implemented. Copying a name's resolved payment
address is also a catalog follow-up; name, selected-address, namehash, and Portal
link copying are implemented. The current record aliases open the editor, and
developer commands open the existing tool panels.

Final local checks: 366 tests across 39 affected Portal files, four developer-tool
tests, Portal/Manager/developer-tool typechecks, changed-file lint, and the
production build passed. Built desktop/mobile browser journeys completed without
page errors. Existing complexity warnings stayed at or below their original
levels.

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
