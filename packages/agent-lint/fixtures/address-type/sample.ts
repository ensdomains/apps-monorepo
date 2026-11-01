type Address = `0x${string}`
export interface Owner {
  readonly ownerAddress: string // expect: address-type
  readonly resolverAddress: Address
  readonly emailAddress: string
  readonly ethAddress: string
}
export const show = (address: string) => address // expect: address-type
export const typed = (address: Address) => address
export type Wording = {
  readonly mail?: {
    readonly address: string
  }
}
