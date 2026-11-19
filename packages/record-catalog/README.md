# ENS record catalog

## Add a text record

Add a definition to `PROFILE_TEXT_RECORDS` in `src/text.ts`. Use the exact
resolver key, a readable name, the role and format, and any useful search
aliases. Discoverable records need an icon ID. Map a new ID in
`src/text-icons.tsx` or `src/social-contact-icons.tsx` for social and contact
icons. Use the `internal` role for protocol fields that should stay out of
picker suggestions.

## Add a coin or its artwork

Add coin identities and codecs through `@ensdomains/address-encoder`. The
catalog reads the encoder's canonical coin types, keeps explicit legacy entries
the encoder removed, and derives supported Sepolia entries from the reverse
registrar configuration in `@ens-apps/l2-primary`. Remove the matching legacy
entry from `REMOVED_COINS` if the encoder restores it. Look up records by coin
type. For example, `0` is Bitcoin and `60` is Ethereum.

Add an SVG as `src/address-assets/<notation>-icon.svg`, using the encoder's
notation. The artwork lookup drops the `Legacy` suffix and shares mainnet art
with the corresponding Sepolia record. `ADDRESS_ICON_ALIASES` in
`src/address.ts` handles filename exceptions such as `bsc` using `bnb-icon.svg`.
Component artwork lives in `src/address-icons.tsx`. Apps supply a fallback for
records without art.

## Add an app consumer

Add `@ens-apps/record-catalog` as a workspace dependency. Import metadata from
`@ens-apps/record-catalog/text` or `@ens-apps/record-catalog/address`. Use
`getTextRecordDescriptor(key)` and `getAddressRecord(coinType)` for existing
records, and `searchTextRecords(query)` or `searchAddressRecords(query)` for
suggestions. Address lookup can also recognize entries outside the suggestions.

UI code can import `getTextRecordIcon` from `@ens-apps/record-catalog/text-icons`
or `getAddressRecordIcon` from `@ens-apps/record-catalog/address-icons`. Apps own
deployment-specific picker eligibility and presentation details such as display
order, fallback artwork, and compact profile links.
