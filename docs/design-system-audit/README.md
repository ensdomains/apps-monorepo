# Design system audit: Manager and Explorer

Snapshot of how components and tokens are used in `apps/manager` (Manager) and
`apps/portal` (Explorer), taken on `main` at `6744eb428` (2026-11-20). It feeds
the cleanup work for Milestones 2 and 3 of the component library
centralization (option A: a shared package in this repo, code as the source of
truth, Figma for tokens and mappings only). Nothing here changes code.

Every number comes from a script in [`scripts/`](./scripts). Run them from the
repo root with `python3`. Counts exclude `*.test.*` and `*.stories.tsx` files
unless a column says otherwise.

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
| `ui/dropdown-menu.tsx` | DropdownMenu + 14 parts | — | primitive | no | no | 5 |
| `ui/field.tsx` | Field + 9 parts | cva `orientation`: vertical, horizontal, responsive | molecule | no | no | 2 |
| `ui/input-group.tsx` | InputGroup + 5 parts | cva `align`: inline-start, inline-end, block-start, block-end; `size`: xs, sm, icon-xs, icon-sm | molecule | no | no | 3 |
| `ui/input.tsx` | Input | — | primitive | no | no | 7 |
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
| `ui/dropdown-menu.tsx` | DropdownMenu + 14 parts | — | primitive | no | no | 5 |
| `ui/field.tsx` | Field + 9 parts | cva `orientation`: vertical, horizontal, responsive | molecule | no | no | 6 |
| `ui/hover-card.tsx` | HoverCard + 2 parts | — | primitive | no | no | 1 |
| `ui/input-group.tsx` | InputGroup + 5 parts | cva `align`: inline-start, inline-end, block-start, block-end; `size`: xs, sm, icon-xs, icon-sm | molecule | no | no | 12 |
| `ui/input.tsx` | Input | — | primitive | no | no | 14 |
| `ui/label.tsx` | Label | — | primitive | no | no | 12 |
| `ui/message-card.tsx` | MessageCard | cva `variant`: primary, success, danger, warning | molecule (Badge + Button) | no | no | 20 |
| `ui/popover.tsx` | Popover + 3 parts | — | primitive | no | no | 6 |
| `ui/radio-group.tsx` | RadioGroup, RadioGroupItem | — | primitive | no | no | 3 |
| `ui/separator.tsx` | Separator | — | primitive | no | no | 3 |
| `ui/sheet.tsx` | Sheet + 7 parts | prop `side`: top, right, bottom, left | primitive | no | no | 15 |
| `ui/sidebar.tsx` | Sidebar + 20 parts | cva `variant`: default, outline; `size`: default, sm, lg | organism (740 lines, `use-mobile` hook) | no | no | 14 |
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

- `--color-ens-garnet-900` is declared twice (lines 69 and 75).
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

Knip is configured (`knip.json`, `pnpm knip`) but does not run in CI
(`grep -n knip .github/workflows/*.yml` prints nothing), so nothing stops new
dead components.

Variant values with no use. Command:
`python3 docs/design-system-audit/scripts/variants.py`, which counts literal
`variant="x"` / `variant: 'x'` in the files that import the component. Each
zero below was then checked for any `'x'` string literal in those files.
Default variants are left out, since every call without the prop uses them.
Dynamic props (`variant={x}`) are not resolved: there are 23 in Manager and
13 in Explorer (`variant=\{` outside `components/ui`), so these are
candidates to confirm, not proof.

| App | Component | Unused values |
| --- | --- | --- |
| Manager | `ui/button` | `variant`: connectWallet, payment |
| Manager | `ui/badge` | `variant`: lightBlue, red |
| Manager | `ui/alert` | `variant`: info |
| Manager | `ens-consumer/button/Button` | `color`: none, lightBlue, temp-light-gray, temp-light-gray-ghost; `size`: none, sm, temp-xxs |
| Manager | `ui/input-group` | `align`: block-start, block-end; `size`: sm, icon-sm |
| Manager | `ui/field` | `orientation`: responsive |
| Explorer | `ui/button` | `variant`: input; `size`: lg |
| Explorer | `ui/badge` | `variant`: accent |
| Explorer | `ui/sidebar` (menu button) | `variant`: outline; `size`: sm, lg |
| Explorer | `ui/input-group` | `align`: block-start, block-end; `size`: icon-sm |
| Explorer | `ui/field` | `orientation`: horizontal, responsive |

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
