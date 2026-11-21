Part of the [design system audit](README.md). Define `X` as shown there before running the commands.

## 1. Inventory

### 1.1 Components

Files: `git ls-files 'apps/manager/src/components/ui/*.tsx' 'apps/manager/src/components/atoms/*.tsx' 'apps/manager/src/components/molecules/*.tsx' 'apps/manager/src/components/organisms/*.tsx' 'apps/manager/src/components/base-ui/*.tsx' 'apps/manager/src/components/ens-consumer/*.tsx' "${X[@]}"`
and `git ls-files 'apps/portal/src/components/ui/*.tsx' "${X[@]}"`.

Variants: read from each file's cva `variants` block and from props typed as
string-literal unions. This lists the lines they start on:
`git grep -nE "variants: \{|^[[:space:]]+(readonly )?(variant|size|tone|color|side|align|orientation|weight|collapsible)\??: ('|[A-Z])" -- apps/manager/src/components apps/portal/src/components/ui "${X[@]}"`.

Scope: Manager `components/{ui,atoms,molecules,organisms}` plus the two
sibling primitive folders it also keeps there (`base-ui/`, `ens-consumer/`).
Explorer has no `atoms`, `molecules` or `organisms` folders: everything shared
sits in `components/ui` (in scope) or flat in `components/` (out of scope, 60+
app-level components such as `EntityBadge`, `CopyButton`, `CoinSelect`).

"Importers" is the number of non-test, non-story files in the same app that
import the component. It counts the `@/` path and relative imports from inside
`components/`. A folder's own `index.ts` re-export is not counted as a use.
For one row, with `<app>`, `<path>` (for example `components/ui/button`) and
`<base>` (`button`) filled in:

```sh
{ git grep -lE "from '@/<path>'" -- apps/<app>/src "${X[@]}"
  git grep -lE "from '\.{1,2}/([^']*/)?<base>'" -- apps/<app>/src/components "${X[@]}"
} | sort -u | grep -v -e '<path>.tsx$' -e '/index.ts$' | wc -l
```

For a component whose folder has the same name (`atoms/CopyableButton/CopyableButton`),
also match the folder path (`@/components/atoms/CopyableButton`). Six
components are reached through a barrel that re-exports several of them, so
their imports were checked by the imported name:
`git grep -nE "from '@/components/(molecules/DomainResultCard|ui/timeline)'" -- apps/manager/src apps/portal/src "${X[@]}"`.
That gives `CheckAvailability.tsx:14` (a multi-line import) for `AddressSuggestionCard`,
`DomainProfileCard` and `DomainResultCard`; `HistoryTimeline.tsx:12` for
`TimelineFrame`; `ActionSummaryRow.tsx:5`, `ExpandableDetailRow.tsx:4` and
`TimelineBreak.tsx:2` for `TimelineRow`. The type-only `RailConnection` import
in `ActionTimeline.tsx:1` is not counted.

Story and Test columns use the same patterns on `'apps/<app>/src/*.stories.tsx'`
and on `'apps/<app>/src/*.test.ts' 'apps/<app>/src/*.test.tsx'`. Usage per
component is analysed in [section 2](usage.md#2-usage-dead-code-and-duplication).

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
| `atoms/CopyableButton/CopyableButton.tsx` | CopyableButton | — | atom | yes | yes | 5 |
| `atoms/DomainCard/DomainCard.tsx` | DomainCard | TS union `variant`: garnet, lapis, peridot | molecule (uses DomainCardPattern) | yes | no | 4 |
| `atoms/DomainCard/DomainCardPattern.tsx` | DomainCardPattern | same `variant` | atom | no | no | 1 |
| `atoms/ImageFallback/ImageFallback.tsx` | ImageFallback + parts | — | atom | no | yes | 14 |
| `atoms/NameCopyButton/NameCopyButton.tsx` | NameCopyButton | — | atom | yes | no | 2 |
| `atoms/PatternAvatar/PatternAvatar.tsx` | PatternAvatar | — | atom | no | yes | 16 |
| `atoms/QRPattern/QRPattern.tsx` | QRPattern | object map `size`: sm, md, lg | atom | yes | no | 0 |
| `atoms/StableCoinsIcons.tsx` | DAI, USDCIcon, USDTIcon | — | atom (icon) | yes | no | 4 |
| `molecules/DomainResultCard/AddressSuggestionCard.tsx` | AddressSuggestionCard | TS union `variant`: compact, card | molecule | no | no | 1 |
| `molecules/DomainResultCard/DomainAttributePill.tsx` | DomainAttributePill | TS union `variant`: available, premium-3, premium-4, cooldown | atom | yes | no | 4 |
| `molecules/DomainResultCard/DomainProfileCard.tsx` | DomainProfileCard | — | organism (imports `features/`) | yes | no | 1 |
| `molecules/DomainResultCard/DomainResultCard.tsx` | DomainResultCard | — | organism (imports `features/`) | yes | yes | 1 |
| `molecules/FormField/FormField.tsx` | FormField | — | molecule | yes | no | 0 |
| `molecules/SearchField/SearchField.tsx` | SearchField | — | molecule | yes | no | 2 |
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
| `ui/timeline/TimelineFrame.tsx` | TimelineFrame | — | molecule | no | no | 1 |
| `ui/timeline/TimelineRow.tsx` | TimelineRow, Rail | — | molecule | no | no | 3 |
| `ui/tooltip.tsx` | Tooltip + 3 parts | — | primitive | no | no | 7 |

Totals: 30 component files; 0 have a story (Explorer has no Storybook:
`git ls-files 'apps/portal/**/*.stories.tsx' | wc -l` prints 0, and there is
no `apps/portal/.storybook`), 1 has a test, 29 have neither.

Icons: Manager uses two icon sets, Material Symbols through `MSymbol` (80
files) and `lucide-react` (75 files). Explorer uses only `lucide-react` (150
files). Command:
`git grep -l "from 'lucide-react'" -- apps/<app>/src "${X[@]}"` and
`git grep -l "components/ui/material-symbol'" -- apps/manager/src "${X[@]}"`.

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

Token use counts in this table, outside the defining CSS file, as class
names or `var(--…)`:

- Old brand colors, 227 (exact token names; `ens-gray-dark`, which is not a
  token, is left out; see [F18](README.md#4-prioritized-findings)):
  ```sh
  git grep -hoP "(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|fill|stroke|ring|from|to|via|outline|divide|decoration|accent|caret|shadow|border-[trblxy])-ens-(?:blue|magenta|green|yellow|orange|brown|gray|white)(?:-(?:hover|light|light-hover|midnight|dark|two|three))?(?![\w-])|var\(--color-ens-(?:blue|magenta|green|yellow|orange|brown|gray|white)(?:-(?:hover|light|light-hover|midnight|dark|two|three))?\)" -- 'apps/manager/src/*.ts' 'apps/manager/src/*.tsx' 'apps/manager/src/*.css' ':!apps/manager/src/styles/theme.css' "${X[@]}" | grep -v ens-gray-dark | wc -l
  ```
- Tailwind default palettes in Manager, 184 (`gray` 92, `slate` 34, `red`
  27); Explorer, 0 outside the grays it switches off:
  ```sh
  git grep -hoP "(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|fill|stroke|from|to)-(?:gray|zinc|slate|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b" -- 'apps/manager/src/*.ts' 'apps/manager/src/*.tsx' 'apps/manager/src/*.css' ':!apps/manager/src/styles/theme.css' "${X[@]}" | wc -l
  ```
- Unused tokens: the loop under "Unused color tokens" in 2.2.

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
- `text-ens-gray-dark` is used at
  `apps/manager/src/features/register-v2/workflow/pricing/components/TokenListItem.tsx:75, 84`,
  but no `--color-ens-gray-dark` exists (`git grep -n "ens-gray-dark" -- apps/manager/src/styles`
  prints nothing). Tailwind makes no class from it, so that text takes the
  inherited color.
- New and old names alias the same value: `ens-lapis-core` and `ens-blue`
  are both `#0080bc`; `ens-peridot-dense` and `ens-peridot-900` are both
  `#033010`.

Figma variables: **not verified.** No Figma file key and node id for the
variables collection is recorded in the code (`git grep -n figma.com -- apps packages` finds
none), so the Tailwind theme and CSS variables above could not be compared
with Figma. Explorer's comments claim its type scale is "1:1 with the ENS
Builder / Figma type styles (WEB-595)" and list three line-height deviations
from Figma (`index.css:451-512`). Those are the authors' claims, not checked
here.
