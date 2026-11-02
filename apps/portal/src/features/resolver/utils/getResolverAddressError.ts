import { match } from 'ts-pattern'
import { isAddress } from 'viem'

const ADDRESS_LENGTH = 42
const HEX_BODY = /^[0-9a-fA-F]*$/

export type GetResolverAddressErrorParams = {
  readonly value: string
  /** The field has lost focus at least once. */
  readonly isTouched: boolean
}

const wrongLengthMessage = (value: string) =>
  `A contract address is ${ADDRESS_LENGTH} characters long, including 0x. This one is ${value.length}.`

/**
 * Explains why a typed resolver address can't be saved, or `null` when there is
 * nothing to say. A short hex value may just be unfinished, so "too short" waits
 * until the field is touched; anything more typing can't fix shows at once.
 */
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
      (v) => !v.startsWith('0x'),
      () => 'A contract address starts with 0x.',
    )
    .when(
      (v) => !HEX_BODY.test(v.slice(2)),
      () =>
        'A contract address only contains the characters 0-9 and a-f after 0x.',
    )
    .when((v) => v.length > ADDRESS_LENGTH || isTouched, wrongLengthMessage)
    .otherwise(() => null)
