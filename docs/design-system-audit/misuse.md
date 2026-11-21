Part of the [design system audit](README.md). Define `X` as shown there before running the commands.

## 3. Misuse

The commands for the rows follow the table (numbered 1–25). Rows that span
multi-line JSX tags (overrides, default-variant buttons, ternaries in class
helpers, icon-only buttons, clickable static elements) cannot be expressed
as one `git grep`: their file:line lists are at the
[bottom of this page](#fileline-lists), found by reading each opening tag
or call. Each pattern is a candidate list, and the false positives found by
reading the lines are called out. Rules cited: `.greptile/config.json` ids, STYLEGUIDE.md sections,
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
| Arbitrary Tailwind values `x-[…]` | `no-arbitrary-tailwind` | 926 in 163 files | 180 in 62 files |
| …of those with a `//` or `/*` comment on the same line | allowed with a reason | 3 | 0 |
| Inline `style={…}` | Utility-First Approach | 65 in 36 files | 17 in 11 files |
| Ternaries inside `cn`/`tw`/`twm`/`clsx` in `features/` | Component Variants with CVA; `pattern-match-complex-conditionals` | 71 in 41 files | 20 in 11 files |
| `tw`/`twm` calls | wiki styleguide `styling.md` (one class helper); `cn-class-helper` only stops new ones | 75 in 34 files | 0 |
| Bare `clsx` import | wiki styleguide `styling.md` (one class helper) | 2 | 0 |
| Logic, IO or copy imported into DS layers | `thin-react-layer` | 13 in 8 files | 1 |
| Static element with `onClick` and no keyboard handler | `div-click-needs-keyboard` | 3 candidates, 0 real (below) | 0 |
| Icon-only `size="icon"` button with no accessible name | ARIA Attributes | 1 candidate, 0 real | 13 candidates, 12 real |
| `outline-none` with no focus replacement on the line | `focus-visible-rings` | 11 in 10 files | 2 in 2 files |
| `focus:ring` instead of `focus-visible:ring` | `focus-visible-rings` | 2 | 4 in 2 files |
| Lucide icon sized with a `size`/`width`/`height` prop | `lucide-size-class` | 0 | 6 in 6 files |

Commands, in table order (`<app>` is `manager` or `portal`; `DS` stands for
the pathspecs `':!apps/manager/src/components/ui' ':!apps/manager/src/components/base-ui' ':!apps/manager/src/components/ens-consumer'`
for Manager and `':!apps/portal/src/components/ui'` for Explorer):

1. Native `<button>`: `git grep -nE '<button([[:space:]>]|$)' -- apps/<app>/src DS "${X[@]}"`.
2. Native `<select>`: `git grep -nE '<select([[:space:]>]|$)' -- apps/<app>/src "${X[@]}"`. Manager prints 2; `register-v2/.../DurationSelector.tsx:108` is inside a comment.
3. Checkboxes: `git grep -n 'type="checkbox"' -- apps/<app>/src ':!*/components/ui/*' "${X[@]}"`.
4. Ranges: `git grep -n 'type="range"' -- apps/<app>/src "${X[@]}"`.
5. Native `<dialog>`: `git grep -nE '<dialog([[:space:]>]|$)' -- apps/manager/src apps/portal/src "${X[@]}"` prints nothing.
6–9. Overrides: [file:line lists](#fileline-lists).
10. Tailwind important modifiers: `` git grep -nE "(:|[[:space:]'\"\`])![a-z][a-z0-9-]*-[a-z0-9]|[a-z0-9]-[a-z0-9\]]*![[:space:]'\"\`]" -- 'apps/*/src/*.ts' 'apps/*/src/*.tsx' "${X[@]}" | grep -vE '!==|!=' ``. It prints 4 lines; `sidebar.tsx:474` has two modifiers, so 5 in all.
11. CSS `!important`: `git grep -n '!important' -- 'apps/*/src/*.css'`.
12. Hex colors: `` git grep -noP "(?<=['\"\`\[(,: ])#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])" -- 'apps/<app>/src/*.tsx' ':!*/assets/*' ':!*/icons/*' "${X[@]}" | wc -l ``.
13. `rgb()`: `git grep -nE 'rgba?\(' -- 'apps/<app>/src/*.tsx' "${X[@]}"`.
14. Arbitrary values (variant selectors such as `data-[…]:` and the custom `w-full-[…]` utility are not values): `git grep -hoP "(?<![\w\[-])-?[a-z][a-z0-9-]*-\[[^\]\s]+\]" -- 'apps/<app>/src/*.tsx' "${X[@]}" | grep -vE '(^|-)(data|aria|has|group|peer|supports|not|in|nth)-[[]' | grep -vE '^(w|max-w)-full-[[]' | wc -l`. Add `| sed -E 's/^(-?[a-z][a-z0-9-]*)-\[.*/\1/' | sort | uniq -c | sort -rn` instead of `wc -l` for the per-utility counts in 3.3, or use `-noP` and `cut -d: -f1 | sort | uniq -c` for per-file counts.
15. Same-line comments: `git grep -nP "(?<![\w\[-])-?[a-z][a-z0-9-]*-\[[^\]\s]+\].*(//|/\*)" -- 'apps/<app>/src/*.tsx' "${X[@]}" | grep -v '://'`. A comment on the line above also counts as a reason under the styleguide but is not counted here; read the lines.
16. Inline styles: `git grep -n 'style={' -- 'apps/<app>/src/*.tsx' "${X[@]}"`.
17. Ternaries in class helpers: [file:line lists](#fileline-lists).
18. `tw`/`twm`: ``git grep -nE '(^|[^A-Za-z0-9_])twm?[(`]' -- 'apps/<app>/src/*.tsx' "${X[@]}"``.
19. Bare `clsx`: `git grep -n "from 'clsx'" -- 'apps/*/src/*.tsx' "${X[@]}"`.
20. DS-layer imports: `git grep -nE "from '(@/features|@/hooks|wagmi|@tanstack/react-query|@lingui|@/lib/[^u]|@ens-apps/|viem)" -- apps/manager/src/components/ui apps/manager/src/components/atoms apps/manager/src/components/molecules apps/manager/src/components/organisms apps/manager/src/components/base-ui apps/manager/src/components/ens-consumer apps/portal/src/components/ui "${X[@]}"`.
21–22. Static `onClick`, icon-only buttons: [file:line lists](#fileline-lists).
23. Outline removed: `git grep -nE 'outline-(none|hidden)' -- 'apps/<app>/src/*.tsx' DS "${X[@]}" | grep -vE 'focus-visible:|focus:ring|focus-within:'`.
24. `focus:ring`: `git grep -nE '(^|[^a-z-])focus:ring' -- 'apps/*/src/*.tsx' "${X[@]}"`.
25. Lucide size props: `git grep -nE '<[A-Z][A-Za-z0-9]*[[:space:]][^>]*(size|width|height)=[{"]' -- $(git grep -l "from 'lucide-react'" -- apps/<app>/src "${X[@]}")`. This searches only files that import `lucide-react`. Hits on `Button`, `InputGroupButton`, `AddressIcon`, `AddressIconFrame` and `NameAvatar` are not Lucide icons; the 6 Explorer hits on `BadgeCheck`, `Frown`, `AlertTriangle`, `HelpCircle` and `AlertCircle` are.

### 3.1 Native elements where a component exists

- Both apps have a `Button`, yet 97 Manager and 26 Explorer native
  `<button>` elements remain. Many are justified unstyled triggers
  (Manager `GlobalBackButton.tsx:120` and `NoticeBanner.tsx:50`, Explorer
  `ListLoader.tsx:46`); the rest need a Design answer on a "bare" or "icon"
  button variant ([Q4](README.md#5-questions-for-design)).
- Manager has no Checkbox, Select or Slider, so its 6 checkboxes
  (`HcaFundingApprovalDialog.tsx:187`, `migration/components/NameRow.tsx:63`,
  `migration/components/NameRow.tsx:234`, `SubnameMigrationDialog.tsx:290`,
  `ResolverImportReview.tsx:50`, `TemporaryPremiumChartDebugControls.tsx:85`),
  1 select (`LanguageSection.tsx:80`) and 2 ranges
  (`ProfileImageCropper.tsx:150`, `TemporaryPremiumChartDebugControls.tsx:59`)
  are gaps in the library, not misuse. Command 2's second Manager `<select>`
  hit (`register-v2/.../DurationSelector.tsx:108`) is inside a comment.
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
  `bg-ens-lapis-core`, while the `blue` variant exists (16 uses:
  `git grep -nE "variant=[{]?[^}]*['\"]blue['\"]" -- apps/manager/src "${X[@]}"`,
  all on `Button` tags).
- `ThirdPartyRenewalDialog.tsx:75`: `h-[74px] … bg-[#E2E8F0]` on a
  `Button`.
- 11 Manager `DialogContent`s replace the dialog's color and 14 its size or
  radius (the 11 are among the 14, so 14 tags in all) (for example `SubnameMigrationDialog.tsx:173` sets `rounded-3xl`
  and a garnet border). No dialog size or tone variant exists.
- Explorer's 22 color overrides are mostly text color on ghost icon buttons
  (`text-muted-foreground`); 2 are inside `ui/` itself. Its 3 background overrides are
  `ConnectWalletMessage.tsx:18`, `dns-import/components/shared.tsx:128`
  (a `danger` tone done by hand with `message-danger-*` classes) and
  `TransactionStateContent.tsx:228`.
- Important modifiers (commands 10 and 11): 5 Tailwind modifiers
  and 1 CSS `!important`. All 5 Tailwind ones are inside `ui/` and come from
  the shadcn sources: `data-[variant=destructive]:*:[svg]:!text-destructive`
  in both dropdown menus (Manager `ui/dropdown-menu.tsx:88`, Explorer
  `ui/dropdown-menu.tsx:75`) makes a destructive item's icon red over the
  icon's own color; Explorer `ui/sidebar.tsx:474` (`size-8!`, `p-2!`) and
  `:485` (`p-0!`) force the collapsed icon size of a menu button. None in
  feature code. The CSS one (`apps/manager/src/styles/index.css:69`) has a
  `biome-ignore` reason (Intercom's injected styles). When these primitives
  move to the shared package, the dropdown and sidebar modifiers can become
  part of the variant instead ([T11](README.md#6-cleanup-plan)).

### 3.3 Hard-coded values instead of tokens

- Manager's arbitrary values are mostly typography: `text-[…]` 218,
  `tracking-[…]` 144, `leading-[…]` 100, then `bg-[…]` 79, `border-[…]` 43,
  `rounded-[…]` 39, `shadow-[…]` 24. Explorer's are mostly layout:
  `max-w-[…]` 29, `ring-[…]` 24 (the shadcn `focus-visible:ring-[3px]`),
  `w-[…]` 23 (command 14, per utility).
- Fractional values copied from Figma exports:
  `DomainAttributePill.tsx:19` `rounded-[14.182px]`,
  `DomainProfileCard.tsx:61` `rounded-[5.215px]`,
  `DomainProfileCard.tsx:90` `gap-[5.417px]`,
  `DomainProfileCard.tsx:50` a two-layer `shadow-[…rgba(14,61,104,…)]`.
- Hex hot spots in Manager (command 12 with `cut -d: -f1 | sort | uniq -c`
  instead of `wc -l`): `notifications/shared/primitives.tsx` (22),
  `TemporaryPremiumChart.tsx` (15), `WalletIcons.tsx` (13, brand marks),
  `ens-consumer/button/Button.tsx` (11: hover, active and disabled states
  have no tokens), `ShareProfileDialog.tsx` (11). Explorer: 13 of its 15 are
  wallet brand marks in `WalletIcons.tsx`.
- Manager keeps Tailwind's default palettes on and uses them 184 times
  (`gray` 92, `slate` 34, `red` 27; command in [1.2](inventory.md#12-tokens)), for example
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
  Manager (command 25: its hits are `Button` and `AddressIcon`, not Lucide
  icons). `size-6` is 24px, so the class gives the same size.

### 3.4 Variant logic in features

91 ternaries sit inside class helpers in feature code (71 Manager in 41
files, 20 Explorer in 11 files; listed under [File:line lists](#fileline-lists)). Examples: `DurationPresets.tsx:27`, `DashboardPagination.tsx:61`,
`dashboard/components/NameRow.tsx:171`, `HomeSearchInput.tsx:257`. Some are one-off state styles
that are fine; repeated ones (selected/unselected chips, compact/regular rows)
are missing variants.

Manager also uses three class helpers: `cn` (`lib/utils.ts:13`), `tw` and
`twm` (`utils/tailwind.ts:42, 82`, 75 calls in 34 files, command 18) and bare `clsx` in
`ui/material-symbol.tsx:1` and `FeaturesCarousel.tsx:2`. `useSortedClasses`
is told about `cn`, `cva` and `clsx` only (`apps/manager/biome.jsonc`), so
classes inside `tw`/`twm` are not sorted. Explorer has no Biome override, so
its classes are not sorted at all (the reason most of the copy diffs in [2.3](usage.md#23-components-copied-between-manager-and-explorer)
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
  hits in both apps render the day number (false positives). The rule only
  matches `size="icon"`, so Manager's icon-only native buttons are not covered.
- Focus removed: 13 lines strip the outline with no focus style on the same
  line (11 Manager in 10 files, 2 Explorer; command 23), for example `SearchField.tsx:64`,
  `dashboard/components/NameRow.tsx:395`, `LanguageSection.tsx:82`,
  `CoinSelect.tsx:110`. Some get focus from a parent `focus-within`; each
  needs a look.
- `focus:ring` (shows on mouse click too) instead of `focus-visible:ring`
  (command 24): Manager `SearchField.tsx:65`, `ui/dialog.tsx:88`; Explorer
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

Command: `git grep -nE "(function|const) (cn|tw|twm|formatRelativeTime|formatUsd|formatUsdCeil|truncateAddress|truncateName)[ (=<]" -- apps packages "${X[@]}"`.

## File:line lists

These rules span multi-line JSX tags or calls, so no single `git grep` line
can express them. Each list was found by reading every opening tag of the
named component (or every class-helper call) in the app's non-test,
non-story `.tsx` files. The line is where the tag or call starts. To recheck
one entry, open the file at that line.

**Manager: `<Button>` with a `bg-*` class in `className` (outside DS folders, `bg-transparent` not counted). 12 in 9 files.**

- `features/dashboard/components/ChoosePrimaryNameDialog.tsx`: 817, 825
- `features/profile/components/dialogs/edit-profile/tabs/addresses/ChainPickerDialog.tsx`: 136
- `features/register-v2/workflow/pricing/components/PaymentAction.tsx`: 46
- `features/register-v2/workflow/registering/components/NotificationSettings.tsx`: 81, 118
- `features/renew/components/ThirdPartyRenewalDialog.tsx`: 75
- `features/wallet/components/BackendAuthModal.tsx`: 104, 161
- `features/wallet/components/EnableSessionModal.tsx`: 101
- `features/wallet/components/RevokeSessionsModal.tsx`: 146
- `features/wallet/components/WithdrawLeftoverFundsModal.tsx`: 178

**Explorer: `<Button>` with a `bg-*` class in `className` (outside DS folders, `bg-transparent` not counted). 3 in 3 files.**

- `features/dashboard/components/ConnectWalletMessage.tsx`: 18
- `features/dns-import/components/shared.tsx`: 128
- `features/transaction-manager/components/TransactionStateContent.tsx`: 228

**Manager: `<Button>` with a text, background or border color class in `className`. 19 in 14 files.**

- `components/ui/calendar.tsx`: 271
- `features/bulk-renew/components/BulkRenewDialog.tsx`: 246
- `features/dashboard/components/ChoosePrimaryNameDialog.tsx`: 817, 825
- `features/dashboard/components/FaqSection.tsx`: 160
- `features/profile/components/dialogs/edit-profile/EditProfileDialogFooter.tsx`: 82
- `features/profile/components/dialogs/edit-profile/EditProfilePreviewActions.tsx`: 22, 31
- `features/profile/components/dialogs/edit-profile/tabs/addresses/ChainPickerDialog.tsx`: 136
- `features/register-v2/workflow/pricing/components/PaymentAction.tsx`: 46
- `features/register-v2/workflow/registering/components/NotificationSettings.tsx`: 81, 118
- `features/renew/components/ThirdPartyRenewalDialog.tsx`: 75
- `features/wallet/components/BackendAuthModal.tsx`: 104, 161, 178
- `features/wallet/components/EnableSessionModal.tsx`: 101
- `features/wallet/components/RevokeSessionsModal.tsx`: 146
- `features/wallet/components/WithdrawLeftoverFundsModal.tsx`: 178

**Explorer: `<Button>` with a text, background or border color class in `className`. 22 in 20 files.**

- `components/CopyButton.tsx`: 53
- `components/SettingsMenu.tsx`: 79
- `components/table/TableMultiSelectFilter.tsx`: 89, 113
- `components/ui/calendar.tsx`: 191
- `components/ui/sidebar.tsx`: 251
- `features/dashboard/components/ConnectWalletMessage.tsx`: 18
- `features/dashboard/components/HomeSearchInput.tsx`: 207
- `features/dns-import/components/shared.tsx`: 128
- `features/forward-resolution/components/AddressResolution/AddressResolutionSidebar.tsx`: 396
- `features/names/components/SubnamesTable.tsx`: 203, 426
- `features/records/components/EditRecordsTable/EditRecordsTable.tsx`: 247
- `features/register/components/RegisterNameSummary.tsx`: 95
- `features/registry/components/v2/NameRegistryRolesOverviewTable.tsx`: 55
- `features/renew/components/ExtensionDurationOrExpiryPicker.tsx`: 53
- `features/resolver/components/NameResolverRolesOverviewTable.tsx`: 97
- `features/reverse-resolution/components/ReverseResolutionTable/ReverseResolutionSidebar.tsx`: 852
- `features/transaction-manager/components/TransactionStateContent.tsx`: 228
- `routes/$name/create-subname.tsx`: 81
- `routes/addr/$addr/index.tsx`: 98
- `routes/resolver/$address/create-link.tsx`: 60

**Manager: `<Button>` with an `h-*`, `rounded-*`, `p-*`, `px-*` or `py-*` class in `className`. 19 in 13 files.**

- `components/AnalyticsConsentBanner.tsx`: 44, 52
- `components/ui/calendar.tsx`: 271
- `features/dashboard/components/ChoosePrimaryNameDialog.tsx`: 817, 825
- `features/dashboard/components/FaqSection.tsx`: 160
- `features/profile/components/dialogs/edit-profile/tabs/addresses/ChainPickerDialog.tsx`: 136
- `features/register-v2/workflow/pricing/components/PaymentAction.tsx`: 46
- `features/register-v2/workflow/pricing/components/SafeWalletDialog.tsx`: 59, 69
- `features/register-v2/workflow/registering/components/NotificationSettings.tsx`: 60, 81
- `features/renew/components/ThirdPartyRenewalDialog.tsx`: 75
- `features/renew/workflow/components/RenewalRouteError.tsx`: 47
- `features/wallet/components/BackendAuthModal.tsx`: 178
- `features/wallet/components/RevokeSessionsModal.tsx`: 146, 173
- `features/wallet/components/WithdrawLeftoverFundsModal.tsx`: 178, 196

**Explorer: `<Button>` with an `h-*`, `rounded-*`, `p-*`, `px-*` or `py-*` class in `className`. 23 in 14 files.**

- `components/AnalyticsConsentBanner.tsx`: 38, 46
- `components/WalletMenu.tsx`: 33
- `components/table/TableMultiSelectFilter.tsx`: 89, 113
- `components/ui/calendar.tsx`: 191
- `features/dashboard/components/ConnectWalletMessage.tsx`: 18
- `features/forward-resolution/components/AddressResolution/AddressResolutionSidebar.tsx`: 231, 396
- `features/migration/components/UpgradeActions.tsx`: 24, 36
- `features/names/components/NamesFilters.tsx`: 270, 285
- `features/records/components/PendingChangesBar.tsx`: 70, 79, 106, 115
- `features/records/components/RecordList.tsx`: 84
- `features/reverse-resolution/components/ReverseResolutionTable/ReverseResolutionSidebar.tsx`: 149
- `features/roles/components/RemoveUserConfirmDialog.tsx`: 125, 132
- `features/roles/components/roleTableColumns.tsx`: 164
- `routes/$name/fuses/burn.tsx`: 292

**Manager: `<DialogContent>` with a color class in `className`. 11 in 11 files.**

- `features/migration/components/MigrationModal.tsx`: 45
- `features/migration/components/MigrationSuccessDialog.tsx`: 344
- `features/migration/components/SubnameMigrationDialog.tsx`: 173
- `features/migration/components/WalletConfirmationStepsDialog.tsx`: 282
- `features/profile/components/dialogs/ShareProfileDialog.tsx`: 388
- `features/profile/components/dialogs/edit-profile/tabs/addresses/ChainPickerDialog.tsx`: 102
- `features/register-v2/workflow/pricing/components/SafeWalletDialog.tsx`: 39
- `features/renew/components/ThirdPartyRenewalDialog.tsx`: 37
- `features/wallet/components/EnableSessionModal.tsx`: 56
- `features/wallet/components/RevokeSessionsModal.tsx`: 92
- `features/wallet/components/WithdrawLeftoverFundsModal.tsx`: 104

**Manager: `<DialogContent>` with a height, radius or padding class in `className`. 14 in 14 files.**

- `features/bulk-renew/components/BulkRenewDialog.tsx`: 342
- `features/dashboard/components/ChoosePrimaryNameDialog.tsx`: 750
- `features/migration/components/MigrationModal.tsx`: 45
- `features/migration/components/MigrationSuccessDialog.tsx`: 344
- `features/migration/components/SubnameMigrationDialog.tsx`: 173
- `features/migration/components/WalletConfirmationStepsDialog.tsx`: 282
- `features/profile/components/dialogs/ShareProfileDialog.tsx`: 388
- `features/profile/components/dialogs/edit-profile/tabs/addresses/ChainPickerDialog.tsx`: 102
- `features/register-v2/workflow/pricing/components/SafeWalletDialog.tsx`: 39
- `features/renew/components/ThirdPartyRenewalDialog.tsx`: 37
- `features/wallet/components/EnableSessionModal.tsx`: 56
- `features/wallet/components/RevokeSessionsModal.tsx`: 92
- `features/wallet/components/WithdrawLeftoverFundsModal.tsx`: 104
- `lib/wallet/stacks/custom/ConnectWalletDialog.tsx`: 298

**Explorer: `<DialogContent>` with a height, radius or padding class in `className`. 4 in 4 files.**

- `components/ui/command.tsx`: 53
- `features/roles/components/RemoveUserConfirmDialog.tsx`: 79
- `features/transaction-manager/components/TransactionModal.tsx`: 67
- `features/wallet/ConnectWalletDialog.tsx`: 289

**Manager: `<Card>` with a height, radius or padding class in `className`. 26 in 22 files.**

- `components/NameFallbackCard.tsx`: 34
- `features/dashboard/components/FaqSection.tsx`: 127
- `features/dashboard/components/PrimaryNameCard.tsx`: 115
- `features/dashboard/pages/DashboardPage.tsx`: 117, 143, 154
- `features/migration/pages/MigrationPermissionsPage.tsx`: 43
- `features/notifications/settings/preferences.tsx`: 175
- `features/profile/components/view/AddressProfileNamesList.tsx`: 334
- `features/profile/components/view/AgentRecordCard.tsx`: 21
- `features/profile/components/view/ProfileAbout.tsx`: 158
- `features/profile/components/view/ProfileContactSection.tsx`: 111
- `features/profile/components/view/ProfileHeaderLoading.tsx`: 197
- `features/profile/components/view/ProfileSkeletonCardSectionLoading.tsx`: 23
- `features/profile/components/view/ProfileSocialSection.tsx`: 62
- `features/profile/components/view/ReverseNameView.tsx`: 15
- `features/register-v2/workflow/pricing/components/CheckoutSummaryCard.tsx`: 241
- `features/register-v2/workflow/pricing/components/DurationSelector.tsx`: 79
- `features/register-v2/workflow/pricing/components/PricingSummaryCard.tsx`: 28
- `features/register-v2/workflow/registering/components/NotificationSettings.tsx`: 52, 92, 100
- `features/renew/workflow/components/RenewalRouteError.tsx`: 21
- `features/renew/workflow/pricing/components/DurationSelector.tsx`: 82
- `features/renew/workflow/pricing/components/PricingSummaryCard.tsx`: 26
- `routes/notifications/_authenticated/settings/index.tsx`: 21

**Manager: Manager `<Button>` (from `ui/button`) with no `variant` prop. 18 in 13 files.**

- `components/HcaFundingApprovalDialog.tsx`: 210
- `components/HcaFundingConfirmDialog.tsx`: 230
- `features/dashboard/components/ChoosePrimaryNameDialog.tsx`: 322, 825
- `features/notifications/RequireBackendAuth.tsx`: 68, 97, 136
- `features/profile/components/dialogs/edit-profile/tabs/addresses/ChainPickerDialog.tsx`: 136
- `features/register-v2/workflow/pricing/components/PaymentAction.tsx`: 46
- `features/renew/components/ThirdPartyRenewalDialog.tsx`: 75
- `features/wallet/components/BackendAuthModal.tsx`: 104, 161
- `features/wallet/components/EnableSessionModal.tsx`: 101
- `features/wallet/components/RevokeSessionsModal.tsx`: 146
- `features/wallet/components/WithdrawLeftoverFundsModal.tsx`: 178
- `routes/debug/backend/index.tsx`: 99, 422
- `routes/debug/backend/settings.tsx`: 192

**Manager: Ternaries choosing a class string inside a `cn(`, `tw(`, `twm(` or `clsx(` call in `features/` (line of the call; a number in brackets is the count of ternaries in that call when above 1). 71 in 41 files.**

- `features/bulk-renew/components/DurationPresets.tsx`: 27
- `features/dashboard/components/DashboardPagination.tsx`: 61
- `features/dashboard/components/NameRow.tsx`: 171
- `features/dashboard/components/SelectionCheckbox.tsx`: 23
- `features/landing/check-availability/CheckAvailability.tsx`: 62
- `features/landing/components/primitives.tsx`: 97
- `features/migration/components/MigrationSuccessDialog.tsx`: 368
- `features/migration/components/NameRow.tsx`: 51, 125, 137, 145, 176, 202
- `features/migration/components/NameTreeRows.tsx`: 49
- `features/migration/components/SelectNamesStep.tsx`: 315 [2]
- `features/migration/components/SelectNamesStepSelectionOptions.tsx`: 159
- `features/migration/components/success/CommemorativeNftCard.tsx`: 118, 240 [4], 304, 358, 482, 491
- `features/migration/components/success/CommemorativeNftClaimDialog.tsx`: 52
- `features/migration/components/success/CommemorativeNftRendererSurface.tsx`: 92
- `features/migration/components/value-props/MigrationValuePropsCarousel.tsx`: 102, 250
- `features/navigation/Header/search/SuggestionItem.tsx`: 107
- `features/notifications/inbox/filter-badge.tsx`: 11 [2]
- `features/notifications/inbox/unread-count.tsx`: 12
- `features/notifications/settings/preference-card.tsx`: 45
- `features/profile/components/dialogs/ShareProfileDialog.tsx`: 331, 334
- `features/profile/components/dialogs/edit-profile/shared/FieldPickerPill.tsx`: 22
- `features/profile/components/dialogs/edit-profile/tabs/general/ProfileImageFieldPanels.tsx`: 95
- `features/profile/components/dialogs/edit-profile/tabs/general/ProfileImageFieldSteps.tsx`: 97, 396, 426
- `features/profile/components/view/AddressProfileHeader.tsx`: 40
- `features/profile/components/view/ProfileAbout.tsx`: 111, 120, 160, 169
- `features/profile/components/view/ProfileActions.tsx`: 130
- `features/profile/components/view/ProfileAddressesSection.tsx`: 55
- `features/profile/components/view/ProfileBanner.tsx`: 41
- `features/profile/components/view/ProfileDetails.tsx`: 100
- `features/profile/components/view/ProfileFavoriteAction.tsx`: 83
- `features/profile/components/view/ProfileHeaderLoading.tsx`: 57, 83, 234
- `features/profile/components/view/ProfileLoadingPrimitives.tsx`: 27
- `features/register-v2/workflow/pricing/components/PaymentAction.tsx`: 48
- `features/register-v2/workflow/pricing/components/PaymentMethodRow.tsx`: 96
- `features/register-v2/workflow/pricing/components/PriceCooldownBanner/PriceCooldownBanner.tsx`: 56, 68
- `features/register-v2/workflow/pricing/components/PriceCooldownBanner/PriceCooldownFeePills.tsx`: 29, 42
- `features/register-v2/workflow/pricing/components/TokenListItem.tsx`: 59, 82
- `features/register-v2/workflow/pricing/components/TokenPickerDialog.tsx`: 64
- `features/register-v2/workflow/pricing/components/temporary-premium/ChartValuePill.tsx`: 77
- `features/register-v2/workflow/pricing/components/temporary-premium/TemporaryPremiumChart.tsx`: 130, 138, 453
- `features/weave-registration/components/WeaveRegistration.tsx`: 97, 119

**Explorer: Ternaries choosing a class string inside a `cn(`, `tw(`, `twm(` or `clsx(` call in `features/` (line of the call; a number in brackets is the count of ternaries in that call when above 1). 20 in 11 files.**

- `features/dashboard/components/HomeSearchInput.tsx`: 257, 304, 320
- `features/dashboard/components/SearchResultsList.tsx`: 58, 151
- `features/dashboard/components/YourNames.tsx`: 37
- `features/history/components/ExpandableDetailRow.tsx`: 27
- `features/register/components/PaymentTokenList.tsx`: 59
- `features/register/components/RegistrationDurationPresets.tsx`: 84, 93, 104, 114, 125
- `features/registry/components/v2/RegistryPanel.tsx`: 21
- `features/renew/components/multi-name-extension/MultiNameSummaryCard.tsx`: 71
- `features/resolver/components/ResolverRolesSidebar.tsx`: 134, 150
- `features/resolver/components/ResolverRolesTable.tsx`: 70
- `features/roles/components/RolesSidebar.tsx`: 293, 311

**Manager: `size="icon"` buttons with no `aria-label`, `aria-labelledby`, `title` or `sr-only` child (candidates; real ones in 3.6). 1 in 1 files.**

- `components/ui/calendar.tsx`: 271

**Explorer: `size="icon"` buttons with no `aria-label`, `aria-labelledby`, `title` or `sr-only` child (candidates; real ones in 3.6). 13 in 11 files.**

- `components/table/TableDateRangeFilter.tsx`: 69
- `components/table/TableMultiSelectFilter.tsx`: 98
- `components/ui/calendar.tsx`: 191
- `components/ui/combobox.tsx`: 263
- `features/register/components/RegistrationDurationPicker.tsx`: 98, 109
- `features/renew/components/ExtendNameConfirmation.tsx`: 55
- `features/renew/components/ExtendNameSettings.tsx`: 56
- `features/renew/components/multi-name-extension/MultiNameExtendSettings.tsx`: 58
- `features/renew/components/multi-name-extension/MultiNameExtendSummary.tsx`: 60
- `features/transaction-manager/components/TransactionStateContent.tsx`: 190
- `routes/resolver/$address/links.tsx`: 127, 329

**Manager: `div`/`span`/`section`/… opening tags with `onClick` and no `role` + key handler (candidates; all explained in 3.6). 3 in 3 files.**

- `components/ui/input-group.tsx`: 70
- `features/migration/components/MigrationModal.tsx`: 86
- `features/migration/components/value-props/MigrationValuePropsCarousel.tsx`: 232
