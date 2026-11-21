# Design system audit: Manager and Explorer

Snapshot of how components and tokens are used in `apps/manager` (Manager) and
`apps/portal` (Explorer), taken on `main` at `6744eb428` (2026-11-20). It feeds
the cleanup work for Milestones 2 and 3 of the component library
centralization (option A: a shared package in this repo, code as the source of
truth, Figma for tokens and mappings only). Nothing here changes code.

Every count has a command next to it, or a file:line list at the bottom of
[misuse.md](misuse.md#fileline-lists) where one `git grep` cannot express
the rule. Run the commands from the repo root in bash or zsh, after defining
the test and story exclusion once:

```sh
X=(':!*.test.*' ':!*.stories.*')
```

Counts leave out `*.test.*` and `*.stories.*` files unless a column says
otherwise. Commands that use `git grep -P` need Git built with PCRE (the
default in Homebrew and most Linux packages).

## Contents

- [Inventory](inventory.md): components and tokens (WEB-2267).
- [Usage, dead code and duplication](usage.md) (WEB-2268).
- [Misuse](misuse.md), with the file:line lists the other pages cite (WEB-2269).
- This page: top problems, prioritized findings, questions for Design and the cleanup plan (WEB-2270).

## Top problems

1. **Two token sets that disagree.** The same color name renders a different
   value in each app (`garnet-500` `#e72a96` vs `#ed2496`), Explorer's `*-400`
   is Manager's `*-300` for four hues, and `rounded-md` is 6px vs 8px.
   Manager also still uses 13 of its 19 "old brand" colors, 227 times, and Tailwind's
   default palette 184 times. ([1.2](inventory.md#12-tokens), F1)
2. **Every shared primitive is a drifted copy.** 16 `ui/` files exist in both
   apps; 15 have drifted (up to 395 diff lines) and the two `cn` helpers merge
   different custom classes. ([2.3](usage.md#23-components-copied-between-manager-and-explorer), F2)
3. **Hard-coded values instead of tokens.** 926 arbitrary Tailwind values in
   Manager (462 of them type: `text`, `tracking`, `leading`) and 180 in
   Explorer; 218 hex colors in Manager. Manager has no type scale. ([3.3](misuse.md#33-hard-coded-values-instead-of-tokens), F6, F7)
4. **Components that fight their callers.** Manager's default `Button` is a
   191×56 CTA; 18 calls take that default and 15 undo it, and the primary
   blue button is rebuilt by hand 7 times. 123 native `<button>`s remain.
   ([3.1](misuse.md#31-native-elements-where-a-component-exists), [3.2](misuse.md#32-overrides-that-fight-a-component), F4)
5. **Accessibility gaps.** 12 icon-only Explorer buttons have no accessible
   name, 6 focus rings use `focus:` instead of `focus-visible:`, and the
   a11y lint rules are warnings. ([3.6](misuse.md#36-accessibility), F3, F11)
6. **Not ready to extract.** Two Manager molecules import from `features/`,
   6 shared files carry Lingui copy, Explorer has no Storybook, and 48 of 71
   components have no story and no test. ([3.5](misuse.md#35-logic-and-copy-in-shared-components), [1.1](inventory.md#11-components), F5, F15)
7. **Dead weight.** 5 components with 0 importers (plus `ui/text`, used only
   by two of them), 46 unused variant values, 87 unused color tokens; knip
   is not in CI. ([2.2](usage.md#22-dead-code), F12)

## 4. Prioritized findings

Severity: **high** blocks the shared package or breaks WCAG, **medium**
spreads inconsistency, **low** is clean-up. Effort: S (< 1 day), M (1–3
days), L (more, split further). Visual-regression risk is what a user could
see change if the fix is done as described. "Codemod" means it can be done
mechanically with no Design input; "Design" means it waits on a question in
section 5.

| # | Finding (section) | Severity | Effort | Files touched | Visual risk | Kind |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | Same token name, different value or step between apps; `ens-` prefix only in Manager ([1.2](inventory.md#12-tokens)) | high | M | 2 CSS files, then every color class (Manager ~1,200 `ens-*` uses: `git grep -hoP "(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|fill|stroke|ring|from|to|via|outline|divide|decoration|accent|caret|shadow)-ens-[a-z0-9-]+" -- 'apps/manager/src/*.tsx' 'apps/manager/src/*.ts' "${X[@]}" \| wc -l`) | high | Design (Q1, Q2) |
| F2 | 16 `ui/` primitives copied and drifted; two `cn` with different merge configs ([2.3](usage.md#23-components-copied-between-manager-and-explorer)) | high | L | 32 `ui/` files, 2 `lib/utils.ts` | medium–high per component | Design for each visual diff; `collapsible` is a codemod |
| F3 | Icon-only buttons with no accessible name ([3.6](misuse.md#36-accessibility)) | high | S | 10 Explorer files | none | Codemod (copy goes through i18n) |
| F4 | Manager `Button` default variant is a fixed 191×56 CTA; primary blue rebuilt by hand 7 times; second Button on Base UI ([3.2](misuse.md#32-overrides-that-fight-a-component), [2.4](usage.md#24-several-components-doing-one-job)) | high | M | `ui/button.tsx`, `ens-consumer/button/*`, 13 call sites | medium | Design (Q4) |
| F5 | DS molecules import from `features/` and carry Lingui copy ([3.5](misuse.md#35-logic-and-copy-in-shared-components)) | high (blocks extraction) | M | 6 DS files | none | Codemod (props in, no visual change) |
| F6 | Manager has no type scale: 462 arbitrary `text/tracking/leading` values, `text-temp-*` tokens ([3.3](misuse.md#33-hard-coded-values-instead-of-tokens), [1.2](inventory.md#12-tokens)) | medium | L | 90+ Manager files | high | Design (Q3) |
| F7 | Hard-coded colors: 218 hex + 32 rgb in Manager, 184 default-palette uses ([3.3](misuse.md#33-hard-coded-values-instead-of-tokens)) | medium | M | 65 + 21 files | medium | Codemod where the hex equals a token value; Design for the rest |
| F8 | Old brand colors still used 227 times; aliases with identical values ([1.2](inventory.md#12-tokens)) | medium | S | 81 Manager files (`git grep -lE -- "-ens-(blue\|magenta\|green\|yellow\|orange\|brown\|gray\|white)" -- apps/manager/src ':!apps/manager/src/styles' "${X[@]}"`) | none for identical values | Codemod |
| F9 | Missing components: Select (both), Checkbox and Slider (Manager), dialog size/tone variants ([3.1](misuse.md#31-native-elements-where-a-component-exists), [3.2](misuse.md#32-overrides-that-fight-a-component)) | medium | M each | new files + 6–25 call sites | medium | Design (Q4, Q7) |
| F10 | Competing components for one job: badges (4), messages (alert + message-card), popovers (Radix + Base UI), copy buttons (4) ([2.4](usage.md#24-several-components-doing-one-job)) | medium | M each | per group, 3–45 call sites | medium | Design (Q5, Q6) |
| F11 | Focus: `focus:` rings in dialogs and sheets, 13 outline removals to check, `animate-shimmer` ignores reduced motion; a11y lint is `warn` ([3.6](misuse.md#36-accessibility)) | medium | S | ~16 files | low (ring shows on keyboard only) | Codemod |
| F12 | Dead components (5 + `ui/text`), 46 unused variant values, 87 unused color tokens; knip not in CI ([2.2](usage.md#22-dead-code)) | low | S | ~12 files | none | Codemod |
| F13 | Class helpers: `tw`/`twm` (75 calls), bare `clsx`, Explorer classes not sorted ([3.4](misuse.md#34-variant-logic-in-features)) | low | S–M | 34 Manager files; all Explorer `.tsx` for sorting | low (`tw`→`cn` adds merging) | Codemod |
| F14 | 91 ternaries in class helpers in features; 25 `DialogContent`, 26 `Card` overrides ([3.2](misuse.md#32-overrides-that-fight-a-component), [3.4](misuse.md#34-variant-logic-in-features)) | low | M | 88 files | medium | Design for repeated states |
| F15 | No Storybook in Explorer; 19 of 41 Manager and 29 of 30 Explorer components have no story and no test ([1.1](inventory.md#11-components)) | medium | M | new stories | none | Codemod |
| F16 | Duplicated formatters (`truncateAddress`, `truncateName`, `formatUsd*`, `formatRelativeTime`) ([3.7](misuse.md#37-duplicated-helpers)) | low | S | 8 files | low (output format may differ) | Codemod, outside the UI package |
| F17 | 6 Explorer Lucide icons sized with `size={24}` instead of `size-6` ([3.3](misuse.md#33-hard-coded-values-instead-of-tokens)) | low | S | 6 files | none (`size-6` is 24px) | Codemod |
| F18 | `text-ens-gray-dark` names a token that does not exist, so 2 lines of the token picker get no color ([1.2](inventory.md#12-tokens)) | low | S | 1 file | low: the text turns gray where it now inherits | Design (which gray) |

Quick wins that need no Design answer: F3, F5, F8, F11, F12, F13, F17, the
`collapsible` part of F2, and F15. Everything else waits on section 5.

## 5. Questions for Design

Open questions, not decisions. The code facts behind each are in the
sections cited. All stay inside the agreed direction: one shared package in
this repo, code as the source of truth, Figma for tokens and mappings.

1. **Ramp values (F1).** Where the apps disagree (`garnet-500` `#e72a96` vs
   `#ed2496`, `citrine-500` `#984d1b` vs `#914b1c`, `quartz-50/100/200/500`),
   which value is the brand value?
2. **Ramp steps (F1).** Manager has 100/300/400/500/900 plus named steps
   (`dust`, `surface`, `core`, `dense`, `bg`, `tint`); Explorer has
   100/200/400/500/900, and its 400 is Manager's 300. Which step names does
   the shared scale use, and are the named steps kept as aliases?
3. **Type scale (F6).** Should Manager use Explorer's `h1/h2/h3/p/base/small`
   scale (15px base), or does Manager need its own steps (it uses 64px and
   32px headings, `text-temp-*`)?
4. **Button set (F4, F9).** Which variants are part of the system: Manager's
   `connectWallet`, `payment`, `lightBlue`, `blue`, the hand-built uppercase
   primary; Explorer's `entity`, `entity-outline`, `success`, `warning`,
   `danger`? Is there a bare variant for icon and text triggers (the 123
   native buttons)?
5. **Badges (F10).** Is `DomainAttributePill` (available, premium-3,
   premium-4, cooldown) a tone of `Badge`? Is Explorer's `EntityBadge` a
   system component or app-level?
6. **Messages (F10).** Are `Alert` and `MessageCard` one component? Manager
   has an `info` tone, Explorer a `neutral` tone.
7. **Dialogs (F9, F14).** Which dialog sizes and tones exist (the garnet
   migration dialogs, `rounded-3xl`)? Is Manager's Drawer and Explorer's
   Sheet the same component?
8. **Dark mode.** Explorer has it, Manager does not. Is it in scope for
   shared components?
9. **Radius.** `rounded-md` is 6px in Manager and 8px in Explorer. Which
   scale?
10. **Icons.** Shared components need one set: Material Symbols (Manager) or
    lucide (both apps)?
11. **Shadows and motion.** Which of `shadow-domain-card`,
    `shadow-temp-card`, `shadow-profile-tile` become tokens, and are there
    duration and easing tokens?
12. **Figma variables.** Where is the variables collection (file key and
    node), so token parity can be checked? This audit could not check it.

## 6. Cleanup plan

Proposed split: Milestone 2 builds the foundation (tokens, the shared
package and its primitives, quick wins); Milestone 3 moves molecules,
organisms and screens onto it. The milestone names in Linear may differ:
confirm before creating tickets. Each ticket is one PR with one concern.
"Waits on" names a Design question; a ticket without one can start now.

### Tokens

| Ticket | M | Scope | Before → after | Verify | Regression risk |
| --- | --- | --- | --- | --- | --- |
| T1 Fix Manager `theme.css` defects | 2 | remove duplicate `ens-garnet-900`, `--Primary-Grey`, unused `bronzite`, `chart-*`, `sidebar-*` | 146 → 129 tokens, same rendering | the unused-token loop in [2.2](usage.md#22-dead-code) lists none of the removed names before the change; typecheck; app at 1440 and 390 px | none if the loop lists them as unused |
| T2b Define or replace `ens-gray-dark` | 2 | `TokenListItem.tsx:75, 84` use a token that does not exist; pick the gray with Design and use an existing token | uncolored text → token color | `git grep -n ens-gray-dark -- apps/manager/src` prints only story lines; screenshot of the token picker | low: the two labels change color |
| T2 Codemod old brand names with identical values | 2 | `ens-blue`→`ens-lapis-core`, `ens-blue-midnight`→`ens-lapis-dense`, `ens-magenta`→`ens-garnet-core`, and the other identical pairs | 227 old uses → only names with no identical new token | grep shows 0 of the replaced names; computed colors unchanged on landing, dashboard, register | none (same hex) |
| T3 Shared token stylesheet | 2 | new `packages/<ui>` with one `tokens.css`, both apps import it, app-only tokens stay in the apps. Waits on Q1, Q2, Q9 | two token sets → one, plus app extras | token parity script (G4) passes; screenshots of 5 key screens per app before/after | high: colors and radii change where values differ |
| T4 Manager default palette to tokens | 2 | 184 `gray/slate/red/…` uses | default palette → tokens; then switch defaults off like Explorer | the default-palette command in [1.2](inventory.md#12-tokens) prints 0 | medium |
| T5 Manager type scale | 2 | adopt the shared `text-*` utilities; retire `text-temp-*`. Waits on Q3 | no scale → named scale | Storybook type story; screenshots | high |

### Atoms (primitives)

| Ticket | M | Scope | Before → after | Verify | Regression risk |
| --- | --- | --- | --- | --- | --- |
| T6 Delete dead components | 2 | `atoms/Badge`, `atoms/QRPattern`, `molecules/FormField`, `organisms/SearchForm`, `ens-consumer/button/LinkButton`, then `ui/text`, with their stories | 6 files fewer | the importer command in [1.1](inventory.md#11-components) prints 0 for none of the remaining files; typecheck | none |
| T7 Remove unused variant values | 2 | the 46 unused values in [2.2](usage.md#22-dead-code) | 46 values fewer | the per-value `git grep` in [2.2](usage.md#22-dead-code) prints no call site; typecheck catches any remaining use | none |
| T8 Accessible names and focus | 2 | `aria-label` on the 12 Explorer icon buttons; `focus-visible:` in both dialogs, Explorer sheet, `SearchField`; reduced motion for `animate-shimmer` | WCAG 4.1.2 and 2.4.7 gaps closed | commands 23 and 24 in [section 3](misuse.md#3-misuse) and the icon-button list in [misuse.md](misuse.md#fileline-lists) drop; keyboard pass on each screen; test by role and name | low |
| T9 Move zero-drift primitives | 2 | `collapsible` into the shared package, used by both apps | 2 copies → 1 | both apps' typecheck and tests; Storybook story | none |
| T10 Shared Button | 2 | one Button with the agreed variants and an explicit CTA variant instead of the 191×56 default; fold `ens-consumer/button` into it. Waits on Q4 | 3 buttons → 1 | Storybook per variant; screenshots of Manager register/renew CTAs and Explorer forms | medium: every `<Button>` with no `variant` changes in Manager |
| T11 Shared drifted primitives | 2 | one PR each: `textarea`, `popover`, `switch`, `tabs`, `label`, `tooltip`, `dialog`, `dropdown-menu`, `input`, `badge`, `alert`, `calendar`. Waits on Q5, Q6, Q8, Q9 | 2 copies → 1 per primitive | Storybook story per state; screenshots of the screens that use it | medium per primitive |
| T12a Shared Checkbox | 2 | move Explorer's `ui/checkbox` to the shared package; replace Manager's 6 native checkboxes ([3.1](misuse.md#31-native-elements-where-a-component-exists)) | 6 native → component; Explorer unchanged | tests by role `checkbox`; keyboard (Space) on the migration name list and funding dialog | medium: the migration list's checked state drives selection |
| T12b New Select | 2 | a Select primitive; replace the 4 native selects (Manager `LanguageSection.tsx:80`, Explorer `ChangeResolverForm.tsx:327`, `edit-records.tsx:452, 514`) | native → component | tests by role `combobox`; keyboard and screen reader; 390 px | medium: record-type and resolver choices feed form submits |
| T12c New Slider | 2 | a Slider primitive for the profile image cropper zoom (`ProfileImageCropper.tsx:150`); the debug control may stay native | native → component | test by role `slider`; arrow keys change zoom | low |
| T13 One class helper | 2 | replace `tw`/`twm` (75 calls) and bare `clsx` with `cn`; one `cn` in the shared package knowing every custom class | 3 helpers → 1 | typecheck; spot-check the 34 files | low (`cn` merges conflicting classes that `tw` kept) |
| T13b Lucide sizing classes | 2 | the 6 Explorer `size={24}` icons in [3.3](misuse.md#33-hard-coded-values-instead-of-tokens) move to `className="size-6"`; `strokeWidth` stays | prop → class, same 24px | command 25 in [section 3](misuse.md#3-misuse) prints no Lucide icon; the 6 message screens (available, error, invalid, not found, DNS claimable, subnames) look the same at 1440 px | none: same rendered size |

### Molecules

| Ticket | M | Scope | Before → after | Verify | Regression risk |
| --- | --- | --- | --- | --- | --- |
| T14 Decouple `DomainResultCard` family | 3 | pass grace badge, theme color and name helpers in as props/slots | molecule imports 0 features | command 20 in [section 3](misuse.md#3-misuse) shows no `@/features` | none |
| T15 Copy out of shared components | 3 | Lingui strings in `ui/dialog`, `ImageFallback`, `NameCopyButton`, `SearchField`, `DomainProfileCard`, `DomainResultCard` become props with app defaults | shared files have no i18n import | command 20 in [section 3](misuse.md#3-misuse) shows no `@lingui` | low |
| T16 Field, Input, InputGroup | 3 | shared versions after T11 `input` | 6 copies → 3 | Storybook; form screens | medium |
| T17 Alert / MessageCard | 3 | one message component. Waits on Q6 | 2 → 1 in Explorer, same API in Manager | screenshots of migration banners, records pages | medium |
| T18 Badge family | 3 | `DomainAttributePill`, `GracePeriodBadge` onto shared Badge tones. Waits on Q5 | 4 badge kinds → 1 + tones | screenshots of search results, dashboard | medium |

### Organisms

| Ticket | M | Scope | Before → after | Verify | Regression risk |
| --- | --- | --- | --- | --- | --- |
| T19 Dialog sizes and tones | 3 | variants for the repeated `DialogContent` overrides (25) and the Drawer/Sheet question. Waits on Q7 | overrides → variants | screenshots of each dialog at 1440 and 390 px | medium |
| T20 Explorer sidebar placement | 3 | decide app-level vs shared for `ui/sidebar` (740 lines, uses a hook) | moved or renamed out of `ui/` | typecheck | none |

### Screens

| Ticket | M | Scope | Before → after | Verify | Regression risk |
| --- | --- | --- | --- | --- | --- |
| T21 Manager primary CTAs | 3 | the 7 hand-built blue buttons and 12 background overrides use the T10 variant | overrides → variant | screenshots of the 9 files' dialogs | medium |
| T22 Typography by feature | 3 | one PR per feature, starting with `ShareProfileDialog` (33 arbitrary values), `MigrationSuccessDialog` (28), `notifications/shared/primitives` (24), then `FeaturesCarousel`, `LinksTab` and `ProfileHeaderLoading` (20 each). After T5 | arbitrary values → scale | command 14 in [section 3](misuse.md#3-misuse), per file; screenshots | high |
| T23 Colors by feature | 3 | hex/rgb to tokens, starting with `notifications/shared/primitives` (22), `TemporaryPremiumChart` (15), `ShareProfileDialog` (11). Brand marks in `WalletIcons` stay | hex → tokens | command 12 in [section 3](misuse.md#3-misuse), per file; screenshots | medium |
| T24 Repeated feature states | 3 | turn repeated class ternaries (chips, rows) into variants | ternaries → variants | the ternary list in [misuse.md](misuse.md#fileline-lists), recounted for the files touched | low |

Outside the UI package, own ticket:

| Ticket | M | Scope | Before → after | Verify | Regression risk |
| --- | --- | --- | --- | --- | --- |
| T25 Shared formatters | 3 | move `truncateAddress`, `truncateName`, `formatUsd`, `formatUsdCeil` into `packages/utils`, one function each with options for the current differences; `formatRelativeTime` stays per caller unless the three signatures can agree ([3.7](misuse.md#37-duplicated-helpers)) | 2 copies per helper → 1, same output for every current input | unit tests in `packages/utils` with each app's current cases (both apps' existing tests for these helpers keep passing unchanged); typecheck in both apps | medium: the copies disagree. Manager's `truncateAddress` joins with `...` (`lib/utils.ts:20`), Explorer's with `…`; the two `truncateName`s take different arguments (label + tld, 10 chars vs full name, 24 chars); Manager's `formatUsdCeil` also accepts a number. Keep each app's output via options, and list any visible change |

### Guardrails

Lint (Biome 2.5, root `biome.jsonc`):

- G1. Turn on `nursery/useSortedClasses` for Explorer too (move it from
  `apps/manager/biome.jsonc` to the root), as its own formatting-only PR.
- G2. Raise `a11y/useButtonType`, `useKeyWithClickEvents`,
  `noStaticElementInteractions` and `noLabelWithoutControl` from `warn` to
  `error` once T8 lands.
- G3. `style/noRestrictedImports`: no `@/features/*` from
  `components/{ui,atoms,molecules}`, no `@/utils/tailwind` or `clsx` outside
  `lib/utils.ts` (after T13), no `@lingui/*` in the shared package.

CI:

- G4. A ratchet job that runs the `git grep` commands in sections [1.2](inventory.md#12-tokens) and [3](misuse.md#3-misuse),
  compares their counts (hex, arbitrary values, native buttons, default
  palette) with a committed baseline, and fails when a count goes up. Lower the baseline as
  tickets land. Until T3, it also checks that same-named tokens in the two
  apps have the same value.
- G5. Uncomment the Knip step in `test.yml` (lines 93-98) so new dead
  components and exports fail the build.
- G6. The shared package requires a story per exported component (a check
  that each `*.tsx` export has a `*.stories.tsx`).

Docs:

- G7. STYLEGUIDE.md "Conditional Classes and Class Helpers" still offers
  `tw`/`twm` as an alternative; reduce it to `cn` only, matching the wiki
  styleguide and `cn-class-helper`.
- G8. A README in the shared package: token names, when to add a variant
  versus pass `className`, how a component is promoted from an app.
- G9. Link this report from `docs/STORYBOOK_GUIDE.md` and record the
  Figma variables location once Q12 is answered.
