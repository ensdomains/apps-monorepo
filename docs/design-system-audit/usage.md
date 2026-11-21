Part of the [design system audit](README.md). Define `X` as shown there before running the commands.

## 2. Usage, dead code and duplication

### 2.1 Import counts

The "Importers" column in [1.1](inventory.md#11-components) is the per-component, per-app import count
(command in [1.1](inventory.md#11-components)). The most used: Explorer `ui/button` (93), Manager
`ui/material-symbol` (80), Manager `ui/button` (54), Manager `ui/card` (27),
Explorer `ui/alert` (26). 23 of 41 Manager files and 12 of 30 Explorer files have
three importers or fewer (5 Manager files have none, see 2.2).

### 2.2 Dead code

Components with 0 importers outside tests and stories (the [1.1](inventory.md#11-components) command,
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

Variant values with no use. Each value of each variant family (cva and
string-union props, as in [1.1](inventory.md#11-components)) was searched for at the component's own call
sites. For one value:

```sh
git grep -nE "variant=[{]?[^}]*['\"]destructive['\"]" -- apps/manager/src "${X[@]}"
```

Each hit was then read to check it sits on the right component's tag, since
the same `variant="x"` can belong to a neighbouring `Alert` or `Badge`.
Default values are left out: every call without the prop uses them.

A value only counts as unused when no call site could pass it. So every call
site of these components was also checked for spread props (`{...props}`) and
for a prop that is not a literal or a ternary of literals
(`git grep -n -A8 -E "<(Button|Badge|Sheet|SheetContent|DomainAttributePill)([[:space:]>]|$)" -- apps/<app>/src "${X[@]}"`,
then reading each tag). Each one was followed to the values that reach it:

| Call site | Passes | Values that reach it |
| --- | --- | --- |
| Manager `routes/debug/backend/index.tsx:76, 132` | `Badge variant={status.variant}` | lightOrange, destructive, secondary, gray (lines 59-64, 121-125) |
| Manager `DomainResultCard.tsx:185`, `PricingDomainHeader.tsx:17`, `TokenPickerContent.tsx:1054` | `DomainAttributePill variant={premiumLabel.variant}` | premium-3, premium-4 (`premiumLabel.ts:19, 27`) |
| Manager `atoms/CopyableButton/CopyableButton.tsx:42` | `Button variant={variant}` and spread | ghost (all 5 callers) |
| Manager `ui/input-group.tsx:113` | `Button variant={variant}` and spread | ghost (default, `input-group.tsx:107`; no caller passes one) |
| Manager `ui/calendar.tsx:271` | spread onto `Button` | day-picker props, no variant (`buttonVariant` defaults to ghost, never passed) |
| Manager `molecules/FormField/FormField.tsx:40` | spread onto `Input` | none: `FormField` has no importers |
| Explorer `features/dnssec-debug/components/StatusIcon.tsx:73` | `Badge variant={BADGE_VARIANT[status]}` | success, warning, danger, outline (lines 57-62) |
| Explorer `TableDateRangeFilter.tsx:55`, `TableMultiSelectFilter.tsx:55` | `Button variant={variant} size={size}` | outline (default, lines 30 and 27); size xs (`HistoryTimeline.tsx:275, 287`) |
| Explorer `ui/input-group.tsx:120` | `Button variant={variant}` and spread | ghost (default, line 114; callers pass ghost) |
| Explorer `ui/message-card.tsx:113` | `Button variant={actionButton.variant \|\| 'default'}` | outline or default (`V1Transfer.tsx:122, 195, 315`, `create-subname.tsx:552`) |
| Explorer `ui/calendar.tsx:191`, `ui/sidebar.tsx:251` | spread onto `Button` | no variant passed (`SidebarTrigger` callers pass only `className`) |
| Explorer `ui/sidebar.tsx:171` | `SheetContent side={side}` | left (the `Sidebar` default, line 140; no caller passes `side`) |

No forwarded prop can pass an unused value, so none is left unresolved. 46
values in live components are unused:

| App | Component | Unused values |
| --- | --- | --- |
| Manager | `ui/button` | `variant`: connectWallet, payment |
| Manager | `ui/badge` | `variant`: outline, lightBlue, red |
| Manager | `ui/alert` | `variant`: info |
| Manager | `ui/dropdown-menu` (`DropdownMenuItem`) | `variant`: destructive |
| Manager | `ui/input` | `variant`: error, success; `size`: sm, lg |
| Manager | `ui/input-group` | `align`: block-start, block-end; `size`: sm, icon-sm |
| Manager | `ui/field` | `orientation`: responsive |
| Manager | `ens-consumer/button/Button` | `color`: none, lightBlue, temp-light-gray, temp-light-gray-ghost; `size`: none, sm, temp-xxs |
| Manager | `atoms/DomainCard` | `variant`: garnet, peridot (all 4 callers pass `lapis`) |
| Manager | `molecules/.../AddressSuggestionCard` | `variant`: compact |
| Explorer | `ui/button` | `variant`: success, warning, input; `size`: lg |
| Explorer | `ui/badge` | `variant`: accent |
| Explorer | `ui/dropdown-menu` (`DropdownMenuItem`) | `variant`: destructive |
| Explorer | `ui/input-group` | `align`: block-start, block-end; `size`: sm, icon-sm |
| Explorer | `ui/field` | `orientation`: horizontal, responsive |
| Explorer | `ui/sheet` | `side`: top |
| Explorer | `ui/sidebar` | `Sidebar` `variant`: floating, inset; `side`: right; `collapsible`: none. `SidebarMenuButton` `variant`: outline; `size`: sm, lg |

The dead components in the table above (`atoms/Badge`, `atoms/QRPattern`,
`ui/text`) are left out: their values go with them.

Unused color tokens, with no use outside the defining CSS file as a class
or `var(--…)`. For Manager (for Explorer, use `apps/portal/src/styles/index.css`,
match `--color-[A-Za-z0-9-]+: var` and search `apps/portal/src`):

```sh
for t in $(grep -oE -- '--color-[A-Za-z0-9-]+:' apps/manager/src/styles/theme.css | sed 's/--color-//;s/://' | sort -u); do
  git grep -qP "(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|fill|stroke|ring|from|to|via|outline|divide|decoration|accent|caret|shadow|border-[trblxy])-$t(?![\w-])|var\(--(?:color-)?$t\)" -- apps/manager/src ':!apps/manager/src/styles/theme.css' "${X[@]}" || echo "$t"
done
```

No color class is built from a variable (`git grep -nE '(bg|text|border|ring|fill|stroke|from|to)-(ens-)?\$\{' -- apps/manager/src apps/portal/src "${X[@]}"`
prints only `apps/portal/src/utils/records/editRecordUtils.ts:54`, an element id, not a
class), so a name with no match is unused. Results:
Manager 38 of 146 (all 4 `ens-bronzite-*`, 14 signal steps, 6 old brand
colors, all 5 `chart-*`, all 8 `sidebar-*`); Explorer 49 of 121 (7 of 8
`quartz-*`, 26 of 27 signal steps as utilities, 4 of 5 `lapis-*`). Explorer's
signal ramps are still read inside `index.css` by its `button-*` and
`message-*` tokens, so they are not dead, just not used directly.

### 2.3 Components copied between Manager and Explorer

Sixteen `ui/` files exist in both apps under the same name. "Diff lines" is
the number of changed lines `diff` prints for each pair:

```sh
for f in apps/manager/src/components/ui/*.tsx; do b=$(basename "$f")
  [ -f "apps/portal/src/components/ui/$b" ] && echo "$b $(diff "$f" "apps/portal/src/components/ui/$b" | grep -c '^[<>]')"
done
```

Part of each diff is class order, because Biome sorts classes only in
Manager. The "Drift" column names differences in the classes or markup
themselves, read from `diff apps/manager/src/components/ui/<file> apps/portal/src/components/ui/<file>`.

| File | Diff lines | Drift |
| --- | --- | --- |
| `collapsible.tsx` | 1 | none (one import line) |
| `textarea.tsx` | 4 | radius `rounded-sm` vs `rounded-md`; Explorer adds dark mode |
| `popover.tsx` | 13 | width `w-72` vs `w-50`; Manager adds `border` |
| `switch.tsx` | 18 | Manager uses brand lapis/gray, Explorer semantic `primary`/`input` |
| `tabs.tsx` | 27 | different list shape (`rounded-full`, `h-9`) and active style |
| `label.tsx` | 41 | `text-sm font-medium` vs `text-base font-normal muted` |
| `badge.tsx` | 43 | Manager: default Tailwind palette; Explorer: semantic fills |
| `dialog.tsx` | 47 | title size and max height (`text-lg`, `max-h-` only in Manager); close-button focus classes |
| `button.tsx` | 75 | different variant sets (section [1.1](inventory.md#11-components)), radius and font |
| `tooltip.tsx` | 79 | color (`bg-foreground` vs `bg-primary`); Explorer adds an arrow and slide-in animation |
| `dropdown-menu.tsx` | 83 | text size (`text-sm` vs `text-base`); Explorer adds a dark destructive style |
| `input-group.tsx` | 109 | spacing and invalid-state styling |
| `input.tsx` | 108 | Manager's adds success/error states and an icon slot (107 vs 25 lines) |
| `field.tsx` | 135 | gaps, padding and text size |
| `alert.tsx` | 174 | different variants (`info` vs `neutral`), brand vs semantic colors |
| `calendar.tsx` | 395 | rewritten: cell size, selected colors, hex values in Manager |

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
| Button | `ui/button` (54), `ens-consumer/button/Button` on Base UI (4), native `<button>` (97 in 70 files, section [3.1](misuse.md#31-native-elements-where-a-component-exists)) | `ui/button` (93), native `<button>` (26 in 21 files) |
| Link styled as button | `LinkButton` in `ui/button.tsx` (1), `ens-consumer/button/LinkButton` (0) | `Button asChild` |
| Copy button | `atoms/CopyableButton` (5), `atoms/NameCopyButton` (2) | `components/CopyButton` (8), `components/CopyableRecord` (8) |
| Badge / pill | `ui/badge` (3), `atoms/Badge` (0), `molecules/.../DomainAttributePill` (4), `features/grace/.../GracePeriodBadge` (3) | `ui/badge` (20, plus `SoonBadge`), `components/EntityBadge` (43) |
| Inline message | `ui/alert` (11) | `ui/alert` (26) and `ui/message-card` (20), same four tones from the same `message-*` tokens |
| Modal / overlay | `ui/dialog` (19), `ui/alert-dialog` (8), `ui/drawer` (3) | `ui/dialog` (13), `ui/sheet` (15) |
| Popover | `ui/popover` on Radix (4) and `base-ui/popover` on Base UI (3) | `ui/popover` (6), `ui/hover-card` (1) |
| Select / dropdown | no Select component; `ui/dropdown-menu` (5); native `<select>` (1) | no Select component; `ui/dropdown-menu` (5), `ui/combobox` (1), `ui/command` (3), `components/CoinSelect` (1); native `<select>` (3) |
| Checkbox | none: native `<input type="checkbox">` (6) | `ui/checkbox` (13) |
| Typography | `ui/text` (dead) next to 214 arbitrary `text-[…]` values (section [3.3](misuse.md#33-hard-coded-values-instead-of-tokens)) | type-scale utilities (`text-h1`…`text-small`) |
| Icons | `MSymbol` (80 files) and lucide (75 files) | lucide (150 files) |

Commands for the app-level rows: `git grep -lE "import .*from '[^']*/<Name>'" -- apps/<app>/src "${X[@]}"`.
