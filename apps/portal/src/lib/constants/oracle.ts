/**
 * Decimal precision the StandardRentPriceOracle uses internally for all price
 * values (base rates, premium price, integrated discount denominator).
 *
 * `formatUnits(rawValue, ORACLE_PRICE_DECIMALS)` converts oracle-native units
 * into USD (since the oracle is denominated in USD-per-second).
 */
export const ORACLE_PRICE_DECIMALS = 12

/**
 * Scale used by the oracle for discount fractions: a `DiscountPoint.value` of
 * `ORACLE_DISCOUNT_SCALE` represents a 100% discount.
 *
 * Mirrors the contract's `DISCOUNT_SCALE = type(uint128).max` (see
 * `StandardRentPriceOracle.sol` / `02_StandardRentPriceOracle.ts`).
 */
export const ORACLE_DISCOUNT_SCALE = (1n << 128n) - 1n
