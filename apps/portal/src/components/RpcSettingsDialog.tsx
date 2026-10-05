import { useEffect, useRef, useState } from 'react'
import { match } from 'ts-pattern'
import {
  checkRpcEndpoint,
  getCustomRpcUrl,
  type InvalidRpcUrlError,
  resetCustomRpcUrl,
  saveCustomRpcUrl,
  validateRpcUrl,
} from '@/lib/customRpc'
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

const INVALID_MESSAGES: Record<InvalidRpcUrlError['reason'], string> = {
  empty: 'Enter an RPC URL.',
  malformed: 'That is not a valid URL.',
  protocol: 'Use an http(s):// or ws(s):// URL.',
  credentials: 'Remove the username and password from the URL.',
}

const isLocal = (url: string) =>
  /^(https?|wss?):\/\/(localhost|127\.0\.0\.1)([:/?#]|$)/.test(url)

// Form state lives here (not inline in the component) so the reset-on-open
// effect has a named home. Reopening a Radix dialog doesn't remount it, so
// without this the previous attempt would still be in the field. The save
// itself stays in the component's submit handler: user-action orchestration
// belongs in handlers, not hooks.
function useRpcForm(open: boolean) {
  const [value, setValue] = useState(() => getCustomRpcUrl() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  // Identifies the latest save attempt. A check that finishes after the
  // dialog closed — or after a newer attempt started — must not save.
  const attemptRef = useRef(0)

  useEffect(() => {
    // Any open/close transition invalidates a pending check.
    attemptRef.current += 1
    if (!open) return
    setValue(getCustomRpcUrl() ?? '')
    setError(null)
    setIsChecking(false)
  }, [open])

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
  open,
  onOpenChange,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
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
  } = useRpcForm(open)

  const save = async (): Promise<void> => {
    const attempt = beginAttempt()
    const validated = validateRpcUrl(value)
    if (validated.isErr())
      return setError(INVALID_MESSAGES[validated.error.reason])

    setError(null)
    setIsChecking(true)
    const checked = await checkRpcEndpoint(validated.value)
    if (!isCurrentAttempt(attempt)) return
    setIsChecking(false)

    if (checked.isErr()) {
      const url = validated.value
      const isPlaintextRemote = /^(http|ws):/.test(url) && !isLocal(url)
      return setError(
        match(checked.error.reason)
          .with('wrong-chain', () => 'This RPC is on a different network.')
          .with('unreachable', () =>
            isPlaintextRemote
              ? 'Could not reach this RPC. Plain http/ws is blocked on remote hosts; use https/wss.'
              : 'Could not reach this RPC.',
          )
          .exhaustive(),
      )
    }
    saveCustomRpcUrl(validated.value)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              <Button variant="ghost" type="button" onClick={resetCustomRpcUrl}>
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
