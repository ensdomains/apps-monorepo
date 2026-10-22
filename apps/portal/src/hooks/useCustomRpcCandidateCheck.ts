import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import {
  confirmCustomRpcCandidate,
  describeRpcError,
} from '@/components/RpcSettingsDialog.handlers'
import { getCustomRpcCandidate } from '@/lib/customRpc'

/**
 * Checks an RPC saved in Settings → RPC on the load after saving, the first
 * whose CSP allows its origin. A passing RPC becomes the active one (the page
 * reloads again); a failing one is dropped with an error toast.
 */
export const useCustomRpcCandidateCheck = (): void => {
  // StrictMode runs effects twice in development; check once.
  const hasChecked = useRef(false)

  useEffect(() => {
    const candidate = getCustomRpcCandidate()
    if (candidate === null || hasChecked.current) return
    hasChecked.current = true

    const toastId = toast.loading('Checking your RPC…')
    void confirmCustomRpcCandidate(candidate).then((result) => {
      if (result.isErr())
        toast.error('RPC not saved', {
          id: toastId,
          description: describeRpcError(result.error, candidate),
        })
    })
  }, [])
}
