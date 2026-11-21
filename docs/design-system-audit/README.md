# Design system audit: Manager and Explorer

Snapshot of how components and tokens are used in `apps/manager` (Manager) and
`apps/portal` (Explorer), taken on `main` at `6744eb428` (2026-11-20). It feeds
the cleanup work for Milestones 2 and 3 of the component library
centralization (option A: a shared package in this repo, code as the source of
truth, Figma for tokens and mappings only). Nothing here changes code.

Every number comes from a script in [`scripts/`](./scripts). Run them from the
repo root with `python3`. The scanners' parsing is covered by
`python3 -m unittest discover -s docs/design-system-audit/scripts`. Counts exclude `*.test.*` and `*.stories.tsx` files
unless a column says otherwise.

## Top problems

1. **Two token sets that disagree.** The same color name renders a different
   value in each app (`garnet-500` `#e72a96` vs `#ed2496`), Explorer's `*-400`
   is Manager's `*-300` for four hues, and `rounded-md` is 6px vs 8px.
   Manager also still uses 13 of its 19 "old brand" colors, 227 times, and Tailwind's
   default palette 184 times. (1.2, F1)
2. **Every shared primitive is a drifted copy.** 16 `ui/` files exist in both
   apps; 15 have drifted (up to 395 diff lines) and the two `cn` helpers merge
   different custom classes. (2.3, F2)
3. **Hard-coded values instead of tokens.** 917 arbitrary Tailwind values in
   Manager (455 of them type: `text`, `tracking`, `leading`) and 180 in
   Explorer; 218 hex colors in Manager. Manager has no type scale. (3.3, F6, F7)
4. **Components that fight their callers.** Manager's default `Button` is a
   191×56 CTA; 18 calls take that default and 15 undo it, and the primary
   blue button is rebuilt by hand 7 times. 123 native `<button>`s remain.
   (3.1, 3.2, F4)
5. **Accessibility gaps.** 12 icon-only Explorer buttons have no accessible
   name, 6 focus rings use `focus:` instead of `focus-visible:`, and the
   a11y lint rules are warnings. (3.6, F3, F11)
6. **Not ready to extract.** Two Manager molecules import from `features/`,
   6 shared files carry Lingui copy, Explorer has no Storybook, and 48 of 71
   components have no story and no test. (3.5, 1.1, F5, F15)
7. **Dead weight.** 5 components with 0 importers (plus `ui/text`, used only
   by two of them), 34 unused variant values (16 more unresolved), 87 unused color tokens; knip
   is not in CI. (2.2, F12)

## 1. Inventory

### 1.1 Components

Command: `python3 docs/design-system-audit/scripts/inventory.py`

Scope: Manager `components/{ui,atoms,molecules,organisms}` plus the two
sibling primitive folders it also keeps there (`base-ui/`, `ens-consumer/`).
Explorer has no `atoms`, `molecules` or `organisms` folders: everything shared
sits in `components/ui` (in scope) or flat in `components/` (out of scope, 60+
app-level components such as `EntityBadge`, `CopyButton`, `CoinSelect`).

"Importers" is the number of non-test, non-story files in the same app that
import the module, through its path, a relative path or its folder's
`index.ts`. Usage per component is analysed in section 2.

Levels: the folder says `ui` = primitive, `atoms`, `molecules`, `organisms`.
Where the code does not match its folder, the "Actual level" column says so.

#### Manager (41 files)

| File | Exports | Variants | Actual level | Story | Test | Importers |
| --- | --- | --- | --- | --- | --- | --- |
| `ui/alert-dialog.tsx` | AlertDialog + 9 parts | — | primitive | no | no | 8 |
| `ui/alert.tsx` | Alert, AlertTitle, AlertDescription | cva `variant`: default, success, warning, info, destructive | primitive | yes | no | 11 |
| `ui/badge.tsx` | Badge | cva `variant`: default, secondary, destructive, outline, lightBlue, lightOrange, red, gray | primitive | no | no | 3 |
| `ui/button.tsx` | Button, LinkButton | cva `variant`: default, destructive, outline, secondary, ghost, link, connectWallet, payment, lightBlue, blue; `size`: default, sm, lg, xl, icon | primitive | yes | yes | 54 |
| `ui/calendar.tsx` | Calendar, CalendarDayButton | — | molecule (uses Button) | no | no | 2 |
| `ui/card.tsx` | Card + 6 parts | — | primitive | no | no | 27 |
| `ui/collapsible.tsx` | Collapsible + 2 parts | — | primitive | no | no | 3 |
| `ui/dialog.tsx` | Dialog + 8 parts | — | primitive | yes | yes | 19 |
| `ui/drawer.tsx` | Drawer + 7 parts (vaul) | — | primitive | no | no | 3 |
| `ui/dropdown-menu.tsx` | DropdownMenu + 14 parts | TS union on `DropdownMenuItem` `variant`: default, destructive | primitive | no | no | 5 |
| `ui/field.tsx` | Field + 9 parts | cva `orientation`: vertical, horizontal, responsive | molecule | no | no | 2 |
| `ui/input-group.tsx` | InputGroup + 5 parts | cva `align`: inline-start, inline-end, block-start, block-end; `size`: xs, sm, icon-xs, icon-sm | molecule | no | no | 3 |
| `ui/input.tsx` | Input | TS unions: `variant` default, error, success; `size` default, sm, lg | primitive | no | no | 7 |
| `ui/label.tsx` | Label | — | primitive | no | no | 3 |
| `ui/material-symbol.tsx` | MSymbol, MATERIAL_SYMBOLS | prop-driven (name, fill, weight) | primitive (icon) | yes | no | 80 |
| `ui/popover.tsx` | Popover + 3 parts (Radix) | — | primitive | no | no | 4 |
| `ui/switch.tsx` | Switch | — | primitive | yes | no | 3 |
| `ui/tabs.tsx` | Tabs + 3 parts | — | primitive | no | yes | 4 |
| `ui/text.tsx` | Text | TS unions: `variant` h1–h6, body, bodySmall, caption, overline; `color`; `align`; `weight` | primitive | no | no | 2 |
| `ui/textarea.tsx` | Textarea | — | primitive | no | no | 2 |
| `ui/tooltip.tsx` | Tooltip + 3 parts | — | primitive | no | yes | 10 |
| `atoms/AvailabilityCheckIcon.tsx` | AvailabilityCheckIcon | — | atom | no | no | 1 |
| `atoms/Badge/Badge.tsx` | Badge (wraps `ui/badge`) | object maps: `variant` + available, unavailable, premium; `size` sm, default, lg | atom | yes | no | 0 |
| `atoms/CopyableButton/CopyableButton.tsx` | CopyableButton | — | atom | yes | yes | 6 |
| `atoms/DomainCard/DomainCard.tsx` | DomainCard | TS union `variant`: garnet, lapis, peridot | molecule (uses DomainCardPattern) | yes | no | 4 |
| `atoms/DomainCard/DomainCardPattern.tsx` | DomainCardPattern | same `variant` | atom | no | no | 1 |
| `atoms/ImageFallback/ImageFallback.tsx` | ImageFallback + parts | — | atom | no | yes | 15 |
| `atoms/NameCopyButton/NameCopyButton.tsx` | NameCopyButton | — | atom | yes | no | 2 |
| `atoms/PatternAvatar/PatternAvatar.tsx` | PatternAvatar | — | atom | no | yes | 17 |
| `atoms/QRPattern/QRPattern.tsx` | QRPattern | object map `size`: sm, md, lg | atom | yes | no | 0 |
| `atoms/StableCoinsIcons.tsx` | DAI, USDCIcon, USDTIcon | — | atom (icon) | yes | no | 4 |
| `molecules/DomainResultCard/AddressSuggestionCard.tsx` | AddressSuggestionCard | TS union `variant`: compact, card | molecule | no | no | 2 |
| `molecules/DomainResultCard/DomainAttributePill.tsx` | DomainAttributePill | TS union `variant`: available, premium-3, premium-4, cooldown | atom | yes | no | 5 |
| `molecules/DomainResultCard/DomainProfileCard.tsx` | DomainProfileCard | — | organism (imports `features/`) | yes | no | 2 |
| `molecules/DomainResultCard/DomainResultCard.tsx` | DomainResultCard | — | organism (imports `features/`) | yes | yes | 2 |
| `molecules/FormField/FormField.tsx` | FormField | — | molecule | yes | no | 0 |
| `molecules/SearchField/SearchField.tsx` | SearchField | — | molecule | yes | no | 3 |
| `organisms/SearchForm/SearchForm.tsx` | SearchForm | — | molecule | yes | no | 0 |
| `base-ui/popover.tsx` | Popover + parts (Base UI) | — | primitive | no | no | 3 |
| `ens-consumer/button/Button.tsx` | Button (Base UI) | cva `color`: none, blue, lightBlue, temp-light-gray, temp-light-gray-ghost; `size`: none, lg, sm, temp-xs, temp-xxs | primitive | yes | no | 4 |
| `ens-consumer/button/LinkButton.tsx` | LinkButton | — | primitive | no | no | 0 |

Totals: 41 component files; 18 (44%) have a story, 8 (20%) a test, 19 have
neither a story nor a test.

#### Explorer (30 files)

| File | Exports | Variants | Actual level | Story | Test | Importers |
| --- | --- | --- | --- | --- | --- | --- |
| `ui/alert.tsx` | Alert, AlertTitle, AlertDescription, AlertClose | cva `variant`: default, neutral, destructive, warning, success | primitive | no | no | 26 |
| `ui/badge.tsx` | Badge, SoonBadge | cva `variant`: default, secondary, ghost, destructive, success, danger, outline, warning, accent | primitive | no | no | 20 |
| `ui/button.tsx` | Button | cva `variant`: default, danger, outline, secondary, success, warning, entity, entity-outline, ghost, link, input; `size`: default, sm, lg, xs, icon | primitive | no | no | 93 |
| `ui/calendar.tsx` | Calendar, CalendarDayButton | — | molecule | no | no | 2 |
| `ui/checkbox.tsx` | Checkbox | — | primitive | no | no | 13 |
| `ui/collapsible.tsx` | Collapsible + 2 parts | — | primitive | no | no | 2 |
| `ui/combobox.tsx` | Combobox + parts (Base UI) | — | molecule | no | no | 1 |
| `ui/command.tsx` | Command + parts (cmdk) | — | molecule | no | yes | 3 |
| `ui/dialog.tsx` | Dialog + 8 parts | — | primitive | no | no | 13 |
| `ui/dropdown-menu.tsx` | DropdownMenu + 14 parts | TS union on `DropdownMenuItem` `variant`: default, destructive | primitive | no | no | 5 |
| `ui/field.tsx` | Field + 9 parts | cva `orientation`: vertical, horizontal, responsive | molecule | no | no | 6 |
| `ui/hover-card.tsx` | HoverCard + 2 parts | — | primitive | no | no | 1 |
| `ui/input-group.tsx` | InputGroup + 5 parts | cva `align`: inline-start, inline-end, block-start, block-end; `size`: xs, sm, icon-xs, icon-sm | molecule | no | no | 12 |
| `ui/input.tsx` | Input | — | primitive | no | no | 14 |
| `ui/label.tsx` | Label | — | primitive | no | no | 12 |
| `ui/message-card.tsx` | MessageCard | cva `variant`: primary, success, danger, warning | molecule (Badge + Button) | no | no | 20 |
| `ui/popover.tsx` | Popover + 3 parts | — | primitive | no | no | 6 |
| `ui/radio-group.tsx` | RadioGroup, RadioGroupItem | — | primitive | no | no | 3 |
| `ui/separator.tsx` | Separator | — | primitive | no | no | 3 |
| `ui/sheet.tsx` | Sheet + 7 parts | TS union on `SheetContent` `side`: top, right, bottom, left | primitive | no | no | 15 |
| `ui/sidebar.tsx` | Sidebar + 20 parts | cva on `SidebarMenuButton` `variant`: default, outline; `size`: default, sm, lg. TS unions on `Sidebar` `side`: left, right; `variant`: sidebar, floating, inset; `collapsible`: offcanvas, icon, none; on `SidebarMenuSubButton` `size`: sm, md | organism (740 lines, `use-mobile` hook) | no | no | 14 |
| `ui/skeleton.tsx` | Skeleton | — | primitive | no | no | 11 |
| `ui/switch.tsx` | Switch | — | primitive | no | no | 3 |
| `ui/table.tsx` | Table + 7 parts | — | primitive | no | no | 19 |
| `ui/tabs.tsx` | Tabs + 3 parts | — | primitive | no | no | 4 |
| `ui/textarea.tsx` | Textarea | — | primitive | no | no | 1 |
| `ui/timeline/TimelineDisclosure.tsx` | TimelineDisclosure | — | molecule | no | no | 2 |
| `ui/timeline/TimelineFrame.tsx` | TimelineFrame | — | molecule | no | no | 2 |
| `ui/timeline/TimelineRow.tsx` | TimelineRow, Rail | — | molecule | no | no | 4 |
| `ui/tooltip.tsx` | Tooltip + 3 parts | — | primitive | no | no | 7 |

Totals: 30 component files; 0 have a story (Explorer has no Storybook:
`git ls-files 'apps/portal/**/*.stories.tsx' | wc -l` prints 0, and there is
no `apps/portal/.storybook`), 1 has a test, 29 have neither.

Icons: Manager uses two icon sets, Material Symbols through `MSymbol` (80
files) and `lucide-react` (75 files). Explorer uses only `lucide-react` (150
files). Command:
`git grep -l "from 'lucide-react'" -- apps/<app>/src` and
`git grep -l "components/ui/material-symbol'" -- apps/<app>/src`, minus test
and story files.

### 1.2 Tokens

Both apps use Tailwind CSS 4 with tokens declared in CSS (`@theme`), not a
`tailwind.config`. Both `components.json` files are identical shadcn configs
(`new-york`, `baseColor: neutral`).

| Category | Manager | Explorer | Agree? |
| --- | --- | --- | --- |
| Definition file | `src/styles/theme.css` (`@theme` + shadcn `:root`) | `src/styles/index.css` (`:root` raw values, then `@theme inline` mapping) | No: different structure |
| Brand colors | `--color-ens-{lapis,garnet,peridot,citrine,quartz,bronzite}-*` (`theme.css:31-104`), utilities `bg-ens-lapis-500` | `--{lapis,garnet,peridot,citrine,quartz}-*` (`index.css:45-76`), utilities `bg-lapis-500` | No: different prefix, ramp steps and values (below) |
| Old brand colors | 19 `--color-ens-{blue,magenta,green,…}` marked "Old brand colors" (`theme.css:136-156`), still used 227 times | none | — |
| Neutrals | `ens-quartz-0…900`, 18 steps (`theme.css:87-104`) | `neutral-0…9`, 10 steps with dark values (`index.css:80-89, 373-382`); `quartz-*` also defined, 7 of its 8 steps unused | No |
| Signal ramps | `ens-signal-{danger,success,warning}-100…900` (`theme.css:106-134`) | `signal-{danger,success,warning}-100…900` (`index.css:93-121`) | Values identical, names differ by `ens-` prefix |
| Semantic (shadcn) | default shadcn neutral in `oklch` (`theme.css:227-257`) | brand hex values, plus `danger`, `success`, `warning`, `*-text`, `*-fill`, `button-*`, `message-*`, `type-entity-*` (`index.css:15-43, 123-158`) | No: Manager's `--primary` is `oklch(0.205 0 0)`, Explorer's is `#191919` |
| Dark mode | none | `.dark` block (`index.css:305-383`) | No |
| Tailwind default palettes | left on; 184 uses of `gray-*`, `slate-*`, `red-*` etc. | grays switched off (`index.css:175-180`); 0 uses of the other default hues | No |
| Type scale | Tailwind defaults kept, plus `text-temp-64px`, `text-temp-32px` marked TEMP (`theme.css:165-169`), `leading-ens-*`, `tracking-ens-wide`, `font-weight-ens-450` | defaults switched off (`--text-*: initial`), `text-h1/h2/h3/p/base/small` "1:1 with Figma" (`index.css:427-456`), utilities `text-caps`, `text-smallmono`, `text-smallcaps`, `text-entity-*` | No |
| Fonts | ABC Monument Grotesk (sans, mono, semi-mono), ABC Marist (serif) | same four families | Yes (`fonts.css` differs by one comment only) |
| Spacing | Tailwind default (`--spacing` not overridden) | Tailwind default | Yes |
| Radii | Tailwind default; `--radius-nft-traits: 20px` | `--radius: 0.625rem` with derived `radius-xs…xl` (`index.css:169-173`) | No: `rounded-md` is 6px in Manager and 8px in Explorer |
| Shadows | `shadow-domain-card`, `shadow-temp-card`, `shadow-profile-tile` (`theme.css:20, 171-172`) | none | — |
| Motion | `tw-animate-css`; keyframes `shimmer`, `domain-card-shimmer`, `fee-decay-nudge` (`index.css:184-226`); no duration or easing tokens | `tw-animate-css` only | Partly |
| Breakpoints | adds `--breakpoint-xs: 30rem` | defaults | No |

Token use counts in this table (old brand 227, default palettes 184, unused
steps) come from `python3 docs/design-system-audit/scripts/tokens.py`.

Brand ramp values that differ for the same name (Manager `theme.css`, Explorer
`index.css`):

| Token | Manager | Explorer |
| --- | --- | --- |
| garnet-500 | `#e72a96` | `#ed2496` |
| citrine-500 | `#984d1b` | `#914b1c` |
| citrine-400 | `#e7a259` | `#e1b77e` (Manager's `citrine-300`) |
| lapis-400 | `#39b4ea` | `#80c4e0` (Manager's `lapis-300`) |
| peridot-400 | `#1cbf46` | `#65d388` (Manager's `peridot-300`) |
| garnet-400 | `#f569ab` | `#ffb0d0` (Manager's `garnet-300`) |
| quartz-50 / 100 / 200 / 500 | `#faf9f7` / `#eeeded` / `#e1e1e0` / `#595755` | `#f8f8f8` / `#e5e5e5` / `#c3c7c8` / `#5d5751` |

So Explorer's `*-400` is Manager's `*-300` for four hues, and the same token
name renders a different color in each app.

Defects inside Manager's `theme.css`:

- `--color-ens-garnet-900` is declared twice (lines 70 and 75).
- `--Primary-Grey` (line 153) has no `--color-` prefix, so Tailwind makes no
  utility from it.
- New and old names alias the same value: `ens-lapis-core` and `ens-blue`
  are both `#0080bc`; `ens-peridot-dense` and `ens-peridot-900` are both
  `#033010`.

Figma variables: **not verified.** No Figma file key and node id for the
variables collection is recorded in the repo (`git grep -n figma.com` finds
none), so the Tailwind theme and CSS variables above could not be compared
with Figma. Explorer's comments claim its type scale is "1:1 with the ENS
Builder / Figma type styles (WEB-595)" and list three line-height deviations
from Figma (`index.css:451-512`). Those are the authors' claims, not checked
here.

## 2. Usage, dead code and duplication

### 2.1 Import counts

The "Importers" column in 1.1 is the per-component, per-app import count
(`inventory.py`). The most used: Explorer `ui/button` (93), Manager
`ui/material-symbol` (80), Manager `ui/button` (54), Manager `ui/card` (27),
Explorer `ui/alert` (26). 23 of 41 Manager files and 11 of 30 Explorer files have
three importers or fewer (5 Manager files have none, see 2.2).

### 2.2 Dead code

Components with 0 importers outside tests and stories (`inventory.py`,
confirmed with `git grep -n <Name> -- apps/<app>/src`):

| Component | Only referenced by | Note |
| --- | --- | --- |
| Manager `atoms/Badge/Badge.tsx` | its story | wraps `ui/badge` with Tailwind default greens, reds and purples |
| Manager `atoms/QRPattern/QRPattern.tsx` | its story | |
| Manager `molecules/FormField/FormField.tsx` | its story | |
| Manager `organisms/SearchForm/SearchForm.tsx` | its story | |
| Manager `ens-consumer/button/LinkButton.tsx` | nothing | `ui/button.tsx` exports its own `LinkButton`, used by `NameFallbackCard.tsx:2` |
| Manager `ui/text.tsx` | `FormField.tsx:3`, `SearchForm.tsx:2` | dead once those two go |

Knip is configured (`knip.json`, `pnpm knip`) but does not run in CI: its
only step, in `.github/workflows/test.yml:93-98`, is commented out "until Knip
is configured for all packages". Nothing stops new dead components.

Variant values with no use. Command:
`python3 docs/design-system-audit/scripts/variants.py`. It covers both
variant families: cva configs and props typed as string-literal unions
(directly or through a type alias in the same folder), and the inventory
lists both. Uses are counted only inside the component's own JSX tags and
its `*Variants({...})` calls, in the files that import it, so a
`size="sm"` on a neighbouring `Button` is not counted for `Input`. A
literal inside an expression counts (`side={isMobile ? 'bottom' : 'right'}`
uses both). Defaults are left out, since every call without the prop uses
them. A value is **unused** when nothing passes it and the component has no
forwarded prop; it is **unresolved** when nothing passes it literally but
some caller forwards a variable (`variant={status.variant}`), so it may
still be used. The script's own tests are in `scripts/test_scripts.py`.

Proven unused, 34 values in live components:

| App | Component | Unused values |
| --- | --- | --- |
| Manager | `ui/alert` | `variant`: info |
| Manager | `ui/dropdown-menu` (`DropdownMenuItem`) | `variant`: destructive |
| Manager | `ui/input` | `variant`: error, success; `size`: sm, lg |
| Manager | `ui/input-group` | `align`: block-start, block-end; `size`: sm, icon-sm |
| Manager | `ui/field` | `orientation`: responsive |
| Manager | `ens-consumer/button/Button` | `color`: none, lightBlue, temp-light-gray, temp-light-gray-ghost; `size`: none, sm, temp-xxs |
| Manager | `atoms/DomainCard` | `variant`: garnet, peridot (all 4 callers pass `lapis`) |
| Manager | `molecules/.../AddressSuggestionCard` | `variant`: compact |
| Explorer | `ui/dropdown-menu` (`DropdownMenuItem`) | `variant`: destructive |
| Explorer | `ui/input-group` | `align`: block-start, block-end; `size`: sm, icon-sm |
| Explorer | `ui/field` | `orientation`: horizontal, responsive |
| Explorer | `ui/sidebar` | `variant`: outline, floating, inset; `size`: sm, lg; `collapsible`: none |

Unresolved, 16 values behind 19 forwarded props:

| App | Component | Values | Forwarded props |
| --- | --- | --- | --- |
| Manager | `ui/badge` | `variant`: destructive, outline, lightBlue, red, gray | 2 (`routes/debug/backend/index.tsx`) |
| Manager | `ui/button` | `variant`: connectWallet, payment | 4 |
| Manager | `molecules/.../DomainAttributePill` | `variant`: premium-3, premium-4 | 3 |
| Explorer | `ui/badge` | `variant`: accent | 1 |
| Explorer | `ui/button` | `variant`: success, warning, input; `size`: lg | 7 |
| Explorer | `ui/sheet` | `side`: top, left | 1 |

The dead components in the table above (`atoms/Badge`, `atoms/QRPattern`,
`ui/text`) are left out: their values go with them.

Unused color tokens (`tokens.py`, uses outside the defining CSS file):
Manager 38 of 146 (all 4 `ens-bronzite-*`, 14 signal steps, 6 old brand
colors, all 5 `chart-*`, all 8 `sidebar-*`); Explorer 49 of 121 (7 of 8
`quartz-*`, 26 of 27 signal steps as utilities, 4 of 5 `lapis-*`). Explorer's
signal ramps are still read inside `index.css` by its `button-*` and
`message-*` tokens, so they are not dead, just not used directly.

### 2.3 Components copied between Manager and Explorer

Sixteen `ui/` files exist in both apps under the same name. Command:
`python3 docs/design-system-audit/scripts/drift.py`. "Diff lines" is
`diff` output; "only in M / only in E" counts class tokens one copy has and
the other lacks, so class order (sorted by Biome only in Manager) does not
count as drift.

| File | Diff lines | Only in M / only in E | Drift |
| --- | --- | --- | --- |
| `collapsible.tsx` | 1 | 0 / 0 | none (one import line) |
| `textarea.tsx` | 4 | 3 / 3 | radius `rounded-sm` vs `rounded-md`; Explorer adds dark mode |
| `popover.tsx` | 13 | 2 / 2 | width `w-72` vs `w-50`; Manager adds `border` |
| `switch.tsx` | 18 | 3 / 10 | Manager uses brand lapis/gray, Explorer semantic `primary`/`input` |
| `tabs.tsx` | 27 | 7 / 19 | different list shape (`rounded-full`, `h-9`) and active style |
| `label.tsx` | 41 | 2 / 6 | `text-sm font-medium` vs `text-base font-normal muted` |
| `badge.tsx` | 43 | 12 / 31 | Manager: default Tailwind palette; Explorer: semantic fills |
| `dialog.tsx` | 47 | 4 / 16 | title size, max height, close button |
| `button.tsx` | 75 | 33 / 41 | different variant sets (section 1.1), radius and font |
| `tooltip.tsx` | 79 | 4 / 18 | color (`bg-foreground` vs `bg-primary`), arrow, animation |
| `dropdown-menu.tsx` | 83 | 4 / 12 | text size, overflow, destructive dark style |
| `input-group.tsx` | 109 | 44 / 25 | spacing and invalid-state styling |
| `input.tsx` | 108 | 36 / 6 | Manager's adds success/error states and an icon slot (107 vs 25 lines) |
| `field.tsx` | 135 | 19 / 20 | gaps, padding and text size |
| `alert.tsx` | 174 | 30 / 45 | different variants (`info` vs `neutral`), brand vs semantic colors |
| `calendar.tsx` | 395 | 36 / 37 | rewritten: cell size, selected colors, hex values in Manager |

All sixteen have drifted except `collapsible.tsx`. Both copies come from the
same shadcn `new-york` base (`components.json`), so the base is a common
starting point for the shared package.

Both apps also define their own `cn`: `apps/manager/src/lib/utils.ts:13`
(clsx + tailwind-merge, extended for three custom shadows) and
`apps/portal/src/lib/utils.ts:27` (cva `cx` + tailwind-merge, extended for
the custom type scale). They are not interchangeable: each one knows only its
own app's custom classes.

### 2.4 Several components doing one job

| Job | Manager (importers) | Explorer (importers) |
| --- | --- | --- |
| Button | `ui/button` (54), `ens-consumer/button/Button` on Base UI (4), native `<button>` (97 in 70 files, section 3.1) | `ui/button` (93), native `<button>` (26 in 21 files) |
| Link styled as button | `LinkButton` in `ui/button.tsx` (1), `ens-consumer/button/LinkButton` (0) | `Button asChild` |
| Copy button | `atoms/CopyableButton` (6), `atoms/NameCopyButton` (2) | `components/CopyButton` (8), `components/CopyableRecord` (8) |
| Badge / pill | `ui/badge` (3), `atoms/Badge` (0), `molecules/.../DomainAttributePill` (5), `features/grace/.../GracePeriodBadge` (3) | `ui/badge` (20, plus `SoonBadge`), `components/EntityBadge` (43) |
| Inline message | `ui/alert` (11) | `ui/alert` (26) and `ui/message-card` (20), same four tones from the same `message-*` tokens |
| Modal / overlay | `ui/dialog` (19), `ui/alert-dialog` (8), `ui/drawer` (3) | `ui/dialog` (13), `ui/sheet` (15) |
| Popover | `ui/popover` on Radix (4) and `base-ui/popover` on Base UI (3) | `ui/popover` (6), `ui/hover-card` (1) |
| Select / dropdown | no Select component; `ui/dropdown-menu` (5); native `<select>` (1) | no Select component; `ui/dropdown-menu` (5), `ui/combobox` (1), `ui/command` (3), `components/CoinSelect` (1); native `<select>` (3) |
| Checkbox | none: native `<input type="checkbox">` (6) | `ui/checkbox` (13) |
| Typography | `ui/text` (dead) next to 214 arbitrary `text-[…]` values (section 3.3) | type-scale utilities (`text-h1`…`text-small`) |
| Icons | `MSymbol` (80 files) and lucide (75 files) | lucide (150 files) |

Commands for the app-level rows: `git grep -lE "import .*from '[^']*/<Name>'" -- apps/<app>/src`,
minus test and story files.

## 3. Misuse

Command for every count in this section unless stated:
`python3 docs/design-system-audit/scripts/misuse.py [<pattern>] [--all]`
(`--all` prints every file:line). The scan is heuristic: each pattern is a
candidate list, and the false positives found by reading the lines are
called out. Rules cited: `.greptile/config.json` ids, STYLEGUIDE.md sections,
the wiki styleguide; "—" where no rule applies.

| Pattern | Rule | Manager | Explorer |
| --- | --- | --- | --- |
| Native `<button>` outside DS folders | — (`Button` exists in both apps) | 97 in 70 files | 26 in 21 files |
| Native `<select>` | — (no Select component exists) | 1 | 3 in 2 files |
| Native `<input type="checkbox">` | — (Explorer has `ui/checkbox`) | 6 in 5 files | 0 |
| Native `<input type="range">` | — (no Slider component) | 2 in 2 files | 0 |
| Native `<dialog>` | — | 0 | 0 |
| `<Button>` overriding background color via `className` (outside DS folders, `bg-transparent` not counted) | Component Variants with CVA | 12 in 9 files | 3 in 3 files |
| `<Button>` overriding height, radius or padding | Component Variants with CVA | 19 in 13 files | 23 in 14 files |
| `<DialogContent>` overriding color | Component Variants with CVA | 11 in 11 files | 0 |
| `<Card>` overriding padding or radius | Component Variants with CVA | 26 in 22 files | n/a |
| Tailwind important modifier (`!x`, `x!`, after any prefix) in `.ts`/`.tsx` | — | 1 | 4 in 2 files |
| CSS `!important` | — | 1, justified (`index.css:69`) | 0 |
| Hex colors outside `assets/`, `icons/` | `no-arbitrary-tailwind` | 218 in 65 files | 15 in 3 files |
| `rgb()`/`rgba()` in `.tsx` | `no-arbitrary-tailwind` | 32 in 21 files | 1 |
| Arbitrary Tailwind values `x-[…]` | `no-arbitrary-tailwind` | 917 in 163 files | 180 in 62 files |
| …of those with a comment on the line or the line above | allowed with a reason | 64 | 10 |
| Inline `style={…}` | Utility-First Approach | 65 in 36 files | 17 in 11 files |
| Ternaries inside `cn`/`tw`/`twm`/`clsx` in `features/` | Component Variants with CVA; `pattern-match-complex-conditionals` | 71 in 41 files | 20 in 11 files |
| `tw`/`twm` calls | wiki styleguide `styling.md` (one class helper); `cn-class-helper` only stops new ones | 75 in 34 files | 0 |
| Bare `clsx` import | wiki styleguide `styling.md` (one class helper) | 2 | 0 |
| Logic, IO or copy imported into DS layers | `thin-react-layer` | 13 in 8 files | 1 |
| Static element with `onClick` and no keyboard handler | `div-click-needs-keyboard` | 3 candidates, 0 real (below) | 0 |
| Icon-only `size="icon"` button with no accessible name | ARIA Attributes | 1 candidate, 0 real | 13 candidates, 12 real |
| `outline-none` with no focus replacement on the line | `focus-visible-rings` | 11 in 10 files | 2 in 2 files |
| `focus:ring` instead of `focus-visible:ring` | `focus-visible-rings` | 2 | 4 in 2 files |
| Lucide icon sized with a `size`/`width`/`height` prop (`misuse.py lucide`) | `lucide-size-class` | 0 | 6 in 6 files |

### 3.1 Native elements where a component exists

- Both apps have a `Button`, yet 97 Manager and 26 Explorer native
  `<button>` elements remain. Many are justified unstyled triggers
  (`GlobalBackButton.tsx:120`, `NoticeBanner.tsx:50`,
  `ListLoader.tsx:46`); the rest need a Design answer on a "bare" or "icon"
  button variant (Q4).
- Manager has no Checkbox, Select or Slider, so its 6 checkboxes
  (`HcaFundingApprovalDialog.tsx:187`, `migration/components/NameRow.tsx:63`,
  `NameRow.tsx:234`, `SubnameMigrationDialog.tsx:290`,
  `ResolverImportReview.tsx:50`, `TemporaryPremiumChartDebugControls.tsx:85`),
  1 select (`LanguageSection.tsx:80`) and 2 ranges
  (`ProfileImageCropper.tsx:150`, `TemporaryPremiumChartDebugControls.tsx:59`)
  are gaps in the library, not misuse. The scan's second Manager `<select>`
  hit (`DurationSelector.tsx:108`) is inside a comment.
- Explorer has `ui/checkbox` and uses it everywhere (0 native checkboxes), but
  has no Select: `ChangeResolverForm.tsx:327`, `edit-records.tsx:452`,
  `edit-records.tsx:514` are native.

### 3.2 Overrides that fight a component

- Manager's `Button` default variant is a fixed CTA shape:
  `h-[56px] w-[191px] … bg-ens-blue` (`ui/button.tsx:21`). 18 `<Button>`s
  in 13 files pass no `variant`; 15 of them then override its size or color
  with `size` or `className` (the other 3 are in `routes/debug/`).
  The same "primary blue" button is rebuilt by hand in
  `BackendAuthModal.tsx:104`, `BackendAuthModal.tsx:161`,
  `EnableSessionModal.tsx:101`, `RevokeSessionsModal.tsx:146`,
  `WithdrawLeftoverFundsModal.tsx:178`, `ChainPickerDialog.tsx:136`,
  `ChoosePrimaryNameDialog.tsx:825` with `bg-ens-blue` or
  `bg-ens-lapis-core`, while the `blue` variant exists (12 literal uses).
- `ThirdPartyRenewalDialog.tsx:75`: `h-[74px] … bg-[#E2E8F0]` on a
  `Button`.
- 11 Manager `DialogContent`s replace the dialog's color and 14 its size or
  radius (for example `SubnameMigrationDialog.tsx:173` sets `rounded-3xl`
  and a garnet border). No dialog size or tone variant exists.
- Explorer's 22 color overrides are mostly text color on ghost icon buttons
  (`text-muted-foreground`); 2 are inside `ui/` itself. Its 3 background overrides are
  `ConnectWalletMessage.tsx:18`, `dns-import/components/shared.tsx:128`
  (a `danger` tone done by hand with `message-danger-*` classes) and
  `TransactionStateContent.tsx:228`.
- Important modifiers (`misuse.py important --all`, which reads every quoted
  class string in `.ts`/`.tsx` and every stylesheet): 5 Tailwind modifiers
  and 1 CSS `!important`. All 5 Tailwind ones are inside `ui/` and come from
  the shadcn sources: `data-[variant=destructive]:*:[svg]:!text-destructive`
  in both dropdown menus (Manager `ui/dropdown-menu.tsx:88`, Explorer
  `ui/dropdown-menu.tsx:75`) makes a destructive item's icon red over the
  icon's own color; Explorer `ui/sidebar.tsx:474` (`size-8!`, `p-2!`) and
  `:485` (`p-0!`) force the collapsed icon size of a menu button. None in
  feature code. The CSS one (`apps/manager/src/styles/index.css:69`) has a
  `biome-ignore` reason (Intercom's injected styles). When these primitives
  move to the shared package, the dropdown and sidebar modifiers can become
  part of the variant instead (T11).

### 3.3 Hard-coded values instead of tokens

- Manager's arbitrary values are mostly typography: `text-[…]` 214,
  `tracking-[…]` 141, `leading-[…]` 100, then `bg-[…]` 78, `border-[…]` 43,
  `rounded-[…]` 39, `shadow-[…]` 24. Explorer's are mostly layout:
  `max-w-[…]` 29, `ring-[…]` 24 (the shadcn `focus-visible:ring-[3px]`),
  `w-[…]` 23 (`misuse.py` summary lines).
- Fractional values copied from Figma exports:
  `DomainAttributePill.tsx:19` `rounded-[14.182px]`,
  `DomainProfileCard.tsx:61` `rounded-[5.215px]`,
  `DomainProfileCard.tsx:90` `gap-[5.417px]`,
  `DomainProfileCard.tsx:50` a two-layer `shadow-[…rgba(14,61,104,…)]`.
- Hex hot spots in Manager: `notifications/shared/primitives.tsx` (22),
  `TemporaryPremiumChart.tsx` (15), `WalletIcons.tsx` (13, brand marks),
  `ens-consumer/button/Button.tsx` (11: hover, active and disabled states
  have no tokens), `ShareProfileDialog.tsx` (11). Explorer: 13 of its 15 are
  wallet brand marks in `WalletIcons.tsx`.
- Manager keeps Tailwind's default palettes on and uses them 184 times
  (`gray` 92, `slate` 34, `red` 27; `tokens.py`), for example
  `atoms/Badge/Badge.tsx` and `ui/badge.tsx`. Explorer switched its grays off
  and uses no other default hue.
- Inline styles: most are dynamic and fine (`BeadProgressBar.tsx:36` width
  from progress, `EventsTable.tsx:44` column width). Manager's
  `TemporaryPremiumChart.tsx` has 10.
- Lucide icons sized by prop instead of a `size-*` class: 6 in Explorer,
  all `size={24} strokeWidth={1.5}` on the `icon` of a message
  (`AvailableNameMessage.tsx:51`, `ErrorMessage.tsx:37`,
  `InvalidNameMessage.tsx:29`, `NotFoundMessage.tsx:31`,
  `DnsClaimableMessage.tsx:44`, `routes/$name/subnames.tsx:72`). 0 in
  Manager. The scan follows each file's `lucide-react` imports (aliases
  included), so props on other components named `size` (for example
  Manager's `AddressIcon size="md"`) are not counted. `size-6` is 24px, so
  the class gives the same size.

### 3.4 Variant logic in features

91 ternaries sit inside class helpers in feature code (71 Manager, 20
Explorer). Examples: `DurationPresets.tsx:27`, `DashboardPagination.tsx:61`,
`NameRow.tsx:171`, `HomeSearchInput.tsx:257`. Some are one-off state styles
that are fine; repeated ones (selected/unselected chips, compact/regular rows)
are missing variants.

Manager also uses three class helpers: `cn` (`lib/utils.ts:13`), `tw` and
`twm` (`utils/tailwind.ts:42, 82`, 75 calls in 34 files) and bare `clsx` in
`ui/material-symbol.tsx:1` and `FeaturesCarousel.tsx:2`. `useSortedClasses`
is told about `cn`, `cva` and `clsx` only (`apps/manager/biome.jsonc`), so
classes inside `tw`/`twm` are not sorted. Explorer has no Biome override, so
its classes are not sorted at all (the reason most of the copy diffs in 2.3
are reordering).

### 3.5 Logic and copy in shared components

| File | Imports | Problem |
| --- | --- | --- |
| `molecules/DomainResultCard/DomainResultCard.tsx:5-7` | `features/grace/.../GracePeriodBadge`, `features/profile/utils/themeColor`, `features/shared/registration/nameUtils` | a molecule depends on three features |
| `molecules/DomainResultCard/DomainProfileCard.tsx:5` | `features/profile/utils/themeColor` | same |
| `molecules/DomainResultCard/AddressSuggestionCard.tsx:3` | `viem` | address handling inside a molecule |
| `atoms/NameCopyButton/NameCopyButton.tsx:3` | `@/hooks/useCopyFeedback` | fine (DOM hook) |
| `atoms/CopyableButton/CopyableButton.tsx:4` | `@/lib/clipboard` | fine (browser API) |
| `ui/dialog.tsx`, `atoms/ImageFallback`, `NameCopyButton`, `SearchField`, `DomainProfileCard`, `DomainResultCard` | `@lingui/react/macro` | app copy in shared components; Explorer uses i18next, so these strings must become props or slots before moving to a shared package |
| Explorer `ui/sidebar.tsx:25` | `@/hooks/use-mobile` | fine (media query) |

No `useQuery`, wagmi or data fetching in any DS-layer file.

### 3.6 Accessibility

- Static `onClick` without keyboard handling: 0 real. The 3 hits are
  `ui/input-group.tsx:70` and `MigrationModal.tsx:86`, both with a
  `biome-ignore` reason, and `MigrationValuePropsCarousel.tsx:232`, whose
  `onClick` is on child buttons (false positive).
- Icon-only buttons with no accessible name: 12 in Explorer.
  `TableDateRangeFilter.tsx:69`, `TableMultiSelectFilter.tsx:98`,
  `ui/combobox.tsx:263`, `RegistrationDurationPicker.tsx:98`,
  `RegistrationDurationPicker.tsx:109`, `ExtendNameConfirmation.tsx:55`,
  `ExtendNameSettings.tsx:56`, `MultiNameExtendSettings.tsx:58`,
  `MultiNameExtendSummary.tsx:60`, `TransactionStateContent.tsx:190`,
  `routes/resolver/$address/links.tsx:127`, `links.tsx:329`. The calendar
  hits in both apps render the day number (false positives). The scan only
  sees `size="icon"`, so Manager's icon-only native buttons are not covered.
- Focus removed: 13 lines strip the outline with no focus style on the same
  line (11 Manager, 2 Explorer), for example `SearchField.tsx:64`,
  `dashboard/components/NameRow.tsx:395`, `LanguageSection.tsx:82`,
  `CoinSelect.tsx:110`. Some get focus from a parent `focus-within`; each
  needs a look.
- `focus:ring` (shows on mouse click too) instead of `focus-visible:ring`:
  Manager `SearchField.tsx:65`, `ui/dialog.tsx:88`; Explorer
  `ui/dialog.tsx:70`, `ui/sheet.tsx:82, 86, 93`.
- Motion: Manager's `animate-shimmer` has no `prefers-reduced-motion`
  override, while `animate-domain-card-shimmer` and `animate-fee-decay` do
  (`apps/manager/src/styles/index.css:194, 228-237`).
- Biome's `a11y` rules `noStaticElementInteractions`, `useButtonType`,
  `useKeyWithClickEvents` and `noLabelWithoutControl` are `warn`, not
  `error` (`biome.jsonc:63-67`), so CI does not block them. Existing
  suppressions: 6 in Manager, 10 in Explorer (5 in tests), each with a
  reason (`git grep -n 'biome-ignore lint/a11y' -- apps/<app>/src`).

### 3.7 Duplicated helpers

| Helper | Definitions |
| --- | --- |
| `cn` | `apps/manager/src/lib/utils.ts:13`, `apps/portal/src/lib/utils.ts:27`, `packages/weave-loader/src/lib/utils.ts:4` (different tailwind-merge config each) |
| `tw` / `twm` | `apps/manager/src/utils/tailwind.ts:42, 82` only |
| `truncateAddress` | `apps/manager/src/lib/utils.ts:17`, `apps/portal/src/utils/formatting/truncateAddress.ts:17` |
| `truncateName` | `apps/manager/src/features/register-v2/utils/truncate-name.ts:1`, `apps/portal/src/utils/formatting/truncateName.ts:15` |
| `formatUsd`, `formatUsdCeil` | `apps/manager/src/utils/formatting/formatUsdCeil.ts:36, 53`, `apps/portal/src/utils/formatting/formatUsdCeil.ts:12, 34` (Manager accepts `string \| number`, Explorer `string`) |
| `formatRelativeTime` | `apps/manager/src/utils/time.ts:12`, `apps/portal/src/features/dashboard/utils/formatActivityEvent.ts:25`, `apps/portal/src/features/dnssec-debug/utils/time.ts:15`, `packages/dev-dqa-overlay/src/panel/formatRelativeTime.ts:1` (three signatures) |

Command: `git grep -nE "(function|const) (cn|tw|twm|formatRelativeTime|formatUsd|formatUsdCeil|truncateAddress|truncateName)[ (=<]" -- apps packages`,
minus tests.

## 4. Prioritized findings

Severity: **high** blocks the shared package or breaks WCAG, **medium**
spreads inconsistency, **low** is clean-up. Effort: S (< 1 day), M (1–3
days), L (more, split further). Visual-regression risk is what a user could
see change if the fix is done as described. "Codemod" means it can be done
mechanically with no Design input; "Design" means it waits on a question in
section 5.

| # | Finding (section) | Severity | Effort | Files touched | Visual risk | Kind |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | Same token name, different value or step between apps; `ens-` prefix only in Manager (1.2) | high | M | 2 CSS files, then every color class (Manager ~1,200 `ens-*` uses, `tokens.py`) | high | Design (Q1, Q2) |
| F2 | 16 `ui/` primitives copied and drifted; two `cn` with different merge configs (2.3) | high | L | 32 `ui/` files, 2 `lib/utils.ts` | medium–high per component | Design for each visual diff; `collapsible` is a codemod |
| F3 | Icon-only buttons with no accessible name (3.6) | high | S | 10 Explorer files | none | Codemod (copy goes through i18n) |
| F4 | Manager `Button` default variant is a fixed 191×56 CTA; primary blue rebuilt by hand 7 times; second Button on Base UI (3.2, 2.4) | high | M | `ui/button.tsx`, `ens-consumer/button/*`, 13 call sites | medium | Design (Q4) |
| F5 | DS molecules import from `features/` and carry Lingui copy (3.5) | high (blocks extraction) | M | 6 DS files | none | Codemod (props in, no visual change) |
| F6 | Manager has no type scale: 455 arbitrary `text/tracking/leading` values, `text-temp-*` tokens (3.3, 1.2) | medium | L | 90+ Manager files | high | Design (Q3) |
| F7 | Hard-coded colors: 218 hex + 32 rgb in Manager, 184 default-palette uses (3.3) | medium | M | 65 + 21 files | medium | Codemod where the hex equals a token value; Design for the rest |
| F8 | Old brand colors still used 227 times; aliases with identical values (1.2) | medium | S | 88 Manager files (`git grep -lE -- "-ens-(blue\|magenta\|green\|yellow\|orange\|brown\|gray\|white)"`) | none for identical values | Codemod |
| F9 | Missing components: Select (both), Checkbox and Slider (Manager), dialog size/tone variants (3.1, 3.2) | medium | M each | new files + 6–25 call sites | medium | Design (Q4, Q7) |
| F10 | Competing components for one job: badges (4), messages (alert + message-card), popovers (Radix + Base UI), copy buttons (4) (2.4) | medium | M each | per group, 3–45 call sites | medium | Design (Q5, Q6) |
| F11 | Focus: `focus:` rings in dialogs and sheets, 13 outline removals to check, `animate-shimmer` ignores reduced motion; a11y lint is `warn` (3.6) | medium | S | ~16 files | low (ring shows on keyboard only) | Codemod |
| F12 | Dead components (5 + `ui/text`), 34 unused variant values, 87 unused color tokens; knip not in CI (2.2) | low | S | ~12 files | none | Codemod |
| F13 | Class helpers: `tw`/`twm` (75 calls), bare `clsx`, Explorer classes not sorted (3.4) | low | S–M | 34 Manager files; all Explorer `.tsx` for sorting | low (`tw`→`cn` adds merging) | Codemod |
| F14 | 91 ternaries in class helpers in features; 25 `DialogContent`, 26 `Card` overrides (3.2, 3.4) | low | M | 88 files | medium | Design for repeated states |
| F15 | No Storybook in Explorer; 19 of 41 Manager and 29 of 30 Explorer components have no story and no test (1.1) | medium | M | new stories | none | Codemod |
| F16 | Duplicated formatters (`truncateAddress`, `truncateName`, `formatUsd*`, `formatRelativeTime`) (3.7) | low | S | 8 files | low (output format may differ) | Codemod, outside the UI package |
| F17 | 6 Explorer Lucide icons sized with `size={24}` instead of `size-6` (3.3) | low | S | 6 files | none (`size-6` is 24px) | Codemod |

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
| T1 Fix Manager `theme.css` defects | 2 | remove duplicate `ens-garnet-900`, `--Primary-Grey`, unused `bronzite`, `chart-*`, `sidebar-*` | 146 → 129 tokens, same rendering | `tokens.py` shows no uses of removed names; typecheck; app at 1440 and 390 px | none if `tokens.py` shows 0 uses |
| T2 Codemod old brand names with identical values | 2 | `ens-blue`→`ens-lapis-core`, `ens-blue-midnight`→`ens-lapis-dense`, `ens-magenta`→`ens-garnet-core`, and the other identical pairs | 227 old uses → only names with no identical new token | grep shows 0 of the replaced names; computed colors unchanged on landing, dashboard, register | none (same hex) |
| T3 Shared token stylesheet | 2 | new `packages/<ui>` with one `tokens.css`, both apps import it, app-only tokens stay in the apps. Waits on Q1, Q2, Q9 | two token sets → one, plus app extras | token parity script (G4) passes; screenshots of 5 key screens per app before/after | high: colors and radii change where values differ |
| T4 Manager default palette to tokens | 2 | 184 `gray/slate/red/…` uses | default palette → tokens; then switch defaults off like Explorer | `tokens.py` default-palette count 0 | medium |
| T5 Manager type scale | 2 | adopt the shared `text-*` utilities; retire `text-temp-*`. Waits on Q3 | no scale → named scale | Storybook type story; screenshots | high |

### Atoms (primitives)

| Ticket | M | Scope | Before → after | Verify | Regression risk |
| --- | --- | --- | --- | --- | --- |
| T6 Delete dead components | 2 | `atoms/Badge`, `atoms/QRPattern`, `molecules/FormField`, `organisms/SearchForm`, `ens-consumer/button/LinkButton`, then `ui/text`, with their stories | 6 files fewer | `inventory.py` shows no 0-importer rows; typecheck | none |
| T7 Remove unused variant values | 2 | the 34 proven-unused values in 2.2; the 16 unresolved ones only after reading their 19 forwarded props | 34 values fewer | `variants.py`; typecheck catches any remaining use | none |
| T8 Accessible names and focus | 2 | `aria-label` on the 12 Explorer icon buttons; `focus-visible:` in both dialogs, Explorer sheet, `SearchField`; reduced motion for `animate-shimmer` | WCAG 4.1.2 and 2.4.7 gaps closed | `misuse.py a11y` counts drop; keyboard pass on each screen; test by role and name | low |
| T9 Move zero-drift primitives | 2 | `collapsible` into the shared package, used by both apps | 2 copies → 1 | both apps' typecheck and tests; Storybook story | none |
| T10 Shared Button | 2 | one Button with the agreed variants and an explicit CTA variant instead of the 191×56 default; fold `ens-consumer/button` into it. Waits on Q4 | 3 buttons → 1 | Storybook per variant; screenshots of Manager register/renew CTAs and Explorer forms | medium: every `<Button>` with no `variant` changes in Manager |
| T11 Shared drifted primitives | 2 | one PR each: `textarea`, `popover`, `switch`, `tabs`, `label`, `tooltip`, `dialog`, `dropdown-menu`, `input`, `badge`, `alert`, `calendar`. Waits on Q5, Q6, Q8, Q9 | 2 copies → 1 per primitive | Storybook story per state; screenshots of the screens that use it | medium per primitive |
| T12a Shared Checkbox | 2 | move Explorer's `ui/checkbox` to the shared package; replace Manager's 6 native checkboxes (3.1) | 6 native → component; Explorer unchanged | tests by role `checkbox`; keyboard (Space) on the migration name list and funding dialog | medium: the migration list's checked state drives selection |
| T12b New Select | 2 | a Select primitive; replace the 4 native selects (Manager `LanguageSection.tsx:80`, Explorer `ChangeResolverForm.tsx:327`, `edit-records.tsx:452, 514`) | native → component | tests by role `combobox`; keyboard and screen reader; 390 px | medium: record-type and resolver choices feed form submits |
| T12c New Slider | 2 | a Slider primitive for the profile image cropper zoom (`ProfileImageCropper.tsx:150`); the debug control may stay native | native → component | test by role `slider`; arrow keys change zoom | low |
| T13 One class helper | 2 | replace `tw`/`twm` (75 calls) and bare `clsx` with `cn`; one `cn` in the shared package knowing every custom class | 3 helpers → 1 | typecheck; spot-check the 34 files | low (`cn` merges conflicting classes that `tw` kept) |
| T13b Lucide sizing classes | 2 | the 6 Explorer `size={24}` icons in 3.3 move to `className="size-6"`; `strokeWidth` stays | prop → class, same 24px | `misuse.py lucide` prints 0; the 6 message screens (available, error, invalid, not found, DNS claimable, subnames) look the same at 1440 px | none: same rendered size |

### Molecules

| Ticket | M | Scope | Before → after | Verify | Regression risk |
| --- | --- | --- | --- | --- | --- |
| T14 Decouple `DomainResultCard` family | 3 | pass grace badge, theme color and name helpers in as props/slots | molecule imports 0 features | `misuse.py ds-layer` shows no `@/features` | none |
| T15 Copy out of shared components | 3 | Lingui strings in `ui/dialog`, `ImageFallback`, `NameCopyButton`, `SearchField`, `DomainProfileCard`, `DomainResultCard` become props with app defaults | shared files have no i18n import | `misuse.py ds-layer` shows no `@lingui` | low |
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
| T22 Typography by feature | 3 | one PR per feature, starting with `MigrationSuccessDialog`, `ShareProfileDialog`, `notifications/shared/primitives`, `FeaturesCarousel`, `LinksTab` (20–28 arbitrary values each). After T5 | arbitrary values → scale | `misuse.py arbitrary` per file; screenshots | high |
| T23 Colors by feature | 3 | hex/rgb to tokens, starting with `notifications/shared/primitives` (22), `TemporaryPremiumChart` (15), `ShareProfileDialog` (11). Brand marks in `WalletIcons` stay | hex → tokens | `misuse.py hex` per file; screenshots | medium |
| T24 Repeated feature states | 3 | turn repeated class ternaries (chips, rows) into variants | ternaries → variants | `misuse.py ternary` count | low |

Outside the UI package, own ticket:

| Ticket | M | Scope | Before → after | Verify | Regression risk |
| --- | --- | --- | --- | --- | --- |
| T25 Shared formatters | 3 | move `truncateAddress`, `truncateName`, `formatUsd`, `formatUsdCeil` into `packages/utils`, one function each with options for the current differences; `formatRelativeTime` stays per caller unless the three signatures can agree (3.7) | 2 copies per helper → 1, same output for every current input | unit tests in `packages/utils` with each app's current cases (both apps' existing tests for these helpers keep passing unchanged); typecheck in both apps | medium: the copies disagree. Manager's `truncateAddress` joins with `...` (`lib/utils.ts:20`), Explorer's with `…`; the two `truncateName`s take different arguments (label + tld, 10 chars vs full name, 24 chars); Manager's `formatUsdCeil` also accepts a number. Keep each app's output via options, and list any visible change |

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

- G4. A ratchet job that runs `misuse.py` and `tokens.py`, compares counts
  (hex, arbitrary values, native buttons, ternaries, default palette) with a
  committed baseline, and fails when a count goes up. Lower the baseline as
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
