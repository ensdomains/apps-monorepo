import { match } from 'ts-pattern'
import { isAddress, isHex } from 'viem'

const ADDRESS_LENGTH = 42

export type GetResolverAddressErrorParams = {
  readonly value: string
  /** The field has lost focus at least once. */
  readonly isTouched: boolean
}

export const getResolverAddressError = ({
  value,
  isTouched,
}: GetResolverAddressErrorParams): string | null =>
  match(value)
    .when(
      (v) => v === '' || isAddress(v),
      () => null,
    )
    .when(
      (v) => isAddress(v, { strict: false }),
      () => "This address's checksum doesn't match. Check it for a typo.",
    )
    .when(
      (v) => v === '0' && !isTouched,
      () => null,
    )
    .when(
      (v) => !v.startsWith('0x'),
      () => 'A contract address starts with 0x.',
    )
    .when(
      (v) => !isHex(v),
      () =>
        'A contract address only contains the characters 0-9 and a-f after 0x.',
    )
    .when(
      (v) => v.length > ADDRESS_LENGTH || isTouched,
      (v) =>
        `A contract address is ${ADDRESS_LENGTH} characters long, including 0x. This one is ${v.length}.`,
    )
    .otherwise(() => null)
