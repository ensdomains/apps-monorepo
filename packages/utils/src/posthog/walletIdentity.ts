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
