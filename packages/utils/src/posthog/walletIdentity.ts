type IdentityInput = {
  readonly isGranted: boolean
  readonly isIdentified: boolean
  readonly distinctId: string
  readonly address?: string
}

type IdentityAction =
  | { readonly type: 'none' | 'reset' }
  | { readonly type: 'identify' | 'replace'; readonly address: string }

export const getWalletIdentityAction = (
  input: IdentityInput,
): IdentityAction => {
  if (!input.isGranted) return { type: input.isIdentified ? 'reset' : 'none' }
  if (!input.address) return { type: input.isIdentified ? 'reset' : 'none' }
  const address = input.address.toLowerCase()
  if (input.isIdentified && input.distinctId === address)
    return { type: 'none' }
  return { type: input.isIdentified ? 'replace' : 'identify', address }
}

/** Undefined means the connector is unresolved; null means a stable disconnection. */
export const hasMatchingWalletIdentity = (
  address: string | null | undefined,
  identity: string,
  event?: string,
): boolean => {
  if (address === undefined) return false
  if (address === null)
    return event === 'wallet:disconnect' || !/^0x[\da-f]{40}$/i.test(identity)
  return address.toLowerCase() === identity
}
