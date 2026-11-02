import type { RhinestoneSigner, Signer } from '@ens-apps/transaction-manager'

/** The HCA signer to set a primary name with; a Safe{Wallet} can't sign its owner intent. */
export const resolvePrimaryNameHcaSigner = ({
  signer,
  isSafeWallet,
}: {
  readonly signer: Signer | null
  readonly isSafeWallet: boolean
}): RhinestoneSigner | undefined =>
  signer?.type === 'rhinestone' && !isSafeWallet ? signer : undefined
