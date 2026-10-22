import { useEffect, useRef, useState } from 'react'
import { getCustomRpcUrl, resetCustomRpcUrl } from '@/lib/customRpc'
import { applyCustomRpc, describeRpcError } from './RpcSettingsDialog.handlers'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Input } from './ui/input'

// Form state lives here (not inline in the component) so the reset-on-open
// effect has a named home. Reopening a Radix dialog doesn't remount it, so
// without this the previous attempt would still be in the field. The save
// logic lives in RpcSettingsDialog.handlers.ts.
function useRpcForm(isOpen: boolean) {
  const [value, setValue] = useState(() => getCustomRpcUrl() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  // Identifies the latest save attempt. A check that finishes after the
  // dialog closed — or after a newer attempt started — must not save.
  const attemptRef = useRef(0)

  useEffect(() => {
    // Any open/close transition invalidates a pending check.
    attemptRef.current += 1
    if (!isOpen) return
    setValue(getCustomRpcUrl() ?? '')
    setError(null)
    setIsChecking(false)
  }, [isOpen])

  return {
    value,
    setValue,
    error,
    setError,
    isChecking,
    setIsChecking,
    beginAttempt: (): number => ++attemptRef.current,
    isCurrentAttempt: (attempt: number): boolean =>
      attempt === attemptRef.current,
  }
}

export const RpcSettingsDialog = ({
  isOpen,
  onOpenChange,
}: {
  readonly isOpen: boolean
  readonly onOpenChange: (isOpen: boolean) => void
}) => {
  const current = getCustomRpcUrl()
  const {
    value,
    setValue,
    error,
    setError,
    isChecking,
    setIsChecking,
    beginAttempt,
    isCurrentAttempt,
  } = useRpcForm(isOpen)

  const save = async (): Promise<void> => {
    const attempt = beginAttempt()
    setError(null)
    setIsChecking(true)
    const result = await applyCustomRpc(value, () => isCurrentAttempt(attempt))
    if (!isCurrentAttempt(attempt)) return
    setIsChecking(false)
    if (result.isErr()) setError(describeRpcError(result.error, value))
  }

  const reset = (): void => {
    const result = resetCustomRpcUrl()
    if (result.isErr()) setError(describeRpcError(result.error, value))
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Custom RPC</DialogTitle>
          <DialogDescription>
            Send all chain requests to your own node instead of the default
            providers. The page reloads when you save.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://…"
            aria-label="RPC URL"
            aria-invalid={error !== null}
            disabled={isChecking}
          />
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            {current && (
              <Button variant="ghost" type="button" onClick={reset}>
                Reset to default
              </Button>
            )}
            <Button type="submit" disabled={isChecking}>
              {isChecking ? 'Checking…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
