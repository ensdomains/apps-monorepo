import { isL1ReverseRegistrarChainId } from '@/lib/reverseRegistrarChainId'

/**
 * Parameters for computing reverse resolution display name state
 */
export type DisplayNameStateParams = {
  /** Name set on the reverse registrar */
  name: string | null
  /** Default name inherited from parent chain (L2 only) */
  defaultName: string | null
  /** Whether the name matches the forward resolution */
  forwardMatch: boolean
  /**
   * Whether {@link defaultName} forward-resolves back to this address.
   * Required rather than optional: `default.reverse` is writable by anyone for
   * any name, so an inherited name with no verified forward half is a claim,
   * not a primary name, and every caller has to say which it is holding.
   */
  defaultForwardMatch: boolean
  /** The reverse registrar chain ID */
  reverseRegistrarChainId: number
}

/**
 * Computed state for reverse resolution display names
 */
export type DisplayNameState = {
  /** The name to display (prioritizes name over defaultName for L2) */
  displayName: string | undefined
  /** Whether the display name is inherited from L1 (L2 only) */
  isInheritingDefault: boolean
  /** Whether this name is set as the primary name */
  isPrimaryName: boolean
  /** Whether this name can be set as the primary name */
  canSetAsPrimary: boolean
  /**
   * An inherited `default.reverse` name whose forward record does not point
   * back at this address — display it, but never as a verified primary name.
   */
  isUnverifiedDefault: boolean
}

/**
 * Computes the display state for reverse resolution names.
 * Handles complex logic for L1 vs L2 chains, default name inheritance,
 * and primary name determination.
 *
 * Rules:
 * - L1: Always uses the directly set name
 * - L2: Can inherit defaultName from L1 if no name is set
 * - Primary name: forward-verified on this chain, or inheriting a
 *   forward-verified default. Inheritance alone is not enough: the
 *   `default.reverse` record is writable by anyone for any name, so an
 *   inherited name whose forward `addr` points elsewhere is an unverified
 *   claim and must not be presented as a primary name.
 * - Can set as primary: a name is set on this chain's reverse registrar but
 *   doesn't forward-match. Applies to L1 and L2 alike — the missing half is
 *   the forward `addr(node, coinType)` record, which is written on the name's
 *   L1 resolver for every chain (ENSIP-19).
 *
 * @param params - Display name computation parameters
 * @returns Computed display state
 *
 * @example
 * // L1 with name and forward match
 * computeDisplayNameState({
 *   name: 'vitalik.eth',
 *   defaultName: null,
 *   forwardMatch: true,
 *   defaultForwardMatch: false,
 *   reverseRegistrarChainId: 60
 * })
 * // { displayName: 'vitalik.eth', isInheritingDefault: false, isPrimaryName: true, canSetAsPrimary: false, isUnverifiedDefault: false }
 *
 * @example
 * // L2 inheriting a forward-verified default from L1
 * computeDisplayNameState({
 *   name: null,
 *   defaultName: 'vitalik.eth',
 *   forwardMatch: false,
 *   defaultForwardMatch: true,
 *   reverseRegistrarChainId: 10
 * })
 * // { displayName: 'vitalik.eth', isInheritingDefault: true, isPrimaryName: true, canSetAsPrimary: false, isUnverifiedDefault: false }
 */
export const computeDisplayNameState = ({
  name,
  defaultName,
  forwardMatch,
  defaultForwardMatch,
  reverseRegistrarChainId,
}: DisplayNameStateParams): DisplayNameState => {
  const isL1 = isL1ReverseRegistrarChainId(reverseRegistrarChainId)

  // Display name: use name if set, otherwise use defaultName on L2 only
  const displayName = name || (defaultName && !isL1 ? defaultName : undefined)

  // Inheriting default: L2 with no name but has defaultName
  const isInheritingDefault = !name && !!defaultName && !isL1

  // An inherited default only counts once its forward half agrees.
  const isUnverifiedDefault = isInheritingDefault && !defaultForwardMatch

  // Primary name: this chain's own record forward-matches, or the inherited
  // default does.
  const isPrimaryName =
    forwardMatch || (isInheritingDefault && defaultForwardMatch)

  // Can set as primary: has displayName, not primary, and a name is actually
  // set on this chain's registrar (not just inherited from the default). The
  // forward record completing the pair is written on L1 for every chain.
  const canSetAsPrimary = !!displayName && !isPrimaryName && name !== null

  return {
    displayName,
    isInheritingDefault,
    isPrimaryName,
    canSetAsPrimary,
    isUnverifiedDefault,
  }
}
