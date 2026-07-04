export type AddressResolutionRow = {
  /** ENSIP-11 / SLIP-44 coin type the address record is keyed on. */
  coinType: number
  label: string
  icon: string
  /** Resolved address for this network (chain-specific record, else the default). */
  address: string | null
  /**
   * Whether the resolved address reverse-resolves back to this name on this
   * network. `null` when there's no address to check; `undefined` while the
   * reverse lookup is in flight.
   */
  reverseMatch: boolean | null | undefined
  /** The name the resolved address reverse-resolves to, if any. */
  reverseName: string | null | undefined
}
