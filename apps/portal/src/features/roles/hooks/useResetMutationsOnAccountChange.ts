import { useEffect } from 'react'

type MutationState = {
  isPending: boolean
  reset: () => void
}

export const useResetMutationsOnAccountChange = (
  selectedAccount: string | undefined,
  saveMutation: MutationState,
  removeUserMutation: MutationState,
) => {
  useEffect(() => {
    if (
      selectedAccount &&
      !saveMutation.isPending &&
      !removeUserMutation.isPending
    ) {
      saveMutation.reset()
      removeUserMutation.reset()
    }
  }, [
    saveMutation.isPending,
    removeUserMutation.isPending,
    saveMutation.reset,
    removeUserMutation.reset,
    selectedAccount,
  ])
}
