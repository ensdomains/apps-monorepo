import type { UseMutationResult } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { WalletClient } from 'viem'

type SignInMutation = UseMutationResult<
  void,
  Error,
  { walletClient: WalletClient }
>

export const ensureAuthenticated = async (
  isAuthed: boolean,
  walletClient: WalletClient | undefined,
  signIn: SignInMutation,
): Promise<boolean> => {
  if (isAuthed) return true

  if (!walletClient) {
    toast.error('Please connect your wallet first')
    return false
  }

  try {
    await signIn.mutateAsync({ walletClient })
    return true
  } catch (error) {
    console.error('Failed to sign in:', error)
    toast.error('Failed to sign in. Please try again.')
    return false
  }
}
