// Address-record writes only, forward direction. `AddrChanged` is v1's ETH-only
// event and stays distinct from v2's multicoin `AddressChanged` all the way
// through the timeline's descriptors, so both belong here or a v1 name's
// resolution history filters down to nothing.
//
// `NameChanged` is the v1 `name()` record written on *this* node, kept because
// the sidebars cover the name's primary-name state alongside its addresses.
// Note it is not where a primary name actually lives — that record sits on
// `{address}.addr.reverse`, a different node this query never reads — so this
// surfaces `name()` writes on the name itself, which are rare in practice.
//
// `AddressUpdated` is what the ENSv2 resolver emits since the 2026-10-01 deployment.
export const ADDRESS_HISTORY_EVENT_TYPES = [
  'AddressUpdated',
  'AddressChanged',
  'AddrChanged',
  'NameChanged',
] as const
