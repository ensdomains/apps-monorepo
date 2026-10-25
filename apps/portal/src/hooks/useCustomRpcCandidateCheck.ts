import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { match } from 'ts-pattern'
import { describeRpcError } from '@/components/RpcSettingsDialog.handlers'
import {
  type CustomRpcCandidate,
  discardCustomRpcCandidate,
  getCustomRpcCheckQueryOptions,
  promoteCustomRpcCandidate,
} from '@/lib/customRpc'
import { queryClient } from '@/utils/queryClient'

// One toast across loading and failure; reusing the id also dedupes
// StrictMode's double effect run.
const TOAST_ID = 'custom-rpc-check'

/**
 * Checks an RPC saved in Settings → RPC on the load after saving, the first
 * whose CSP allows its origin. A pass makes it the active RPC (the page
 * reloads again); a failure drops it with an error toast.
 */
export const useCustomRpcCandidateCheck = (
  candidate: CustomRpcCandidate,
): void => {
  // The caller sits beside the Toaster, outside QueryClientProvider, so the
  // shared client is passed in directly.
  const { status, error } = useQuery(
    getCustomRpcCheckQueryOptions(candidate),
    queryClient,
  )

  useEffect(() => {
    match(status)
      .with('pending', () => {
        toast.loading('Checking your RPC…', { id: TOAST_ID })
      })
      .with('success', () => {
        // A promoted RPC reloads the page; a superseded one changes nothing.
        void promoteCustomRpcCandidate(candidate).then((result) => {
          if (result.isOk()) {
            toast.dismiss(TOAST_ID)
            return
          }
          toast.error('RPC not saved', {
            id: TOAST_ID,
            description: describeRpcError(result.error, candidate.url),
          })
        })
      })
      .with('error', () => {
        void discardCustomRpcCandidate(candidate)
        if (error)
          toast.error('RPC not saved', {
            id: TOAST_ID,
            description: describeRpcError(error, candidate.url),
          })
      })
      .exhaustive()
  }, [status, error, candidate])
}
