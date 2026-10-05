import { useState } from 'react'
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
  /^(https?|wss?):\/\/(localhost|127\.0\.0\.1)\b/.test(url)

export const RpcSettingsDialog = ({
  open,
  onOpenChange,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}) => {
  const current = getCustomRpcUrl()
  const [value, setValue] = useState(current ?? '')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const save = async () => {
    const validated = validateRpcUrl(value)
    if (validated.isErr())
      return setError(INVALID_MESSAGES[validated.error.reason])

    setError(null)
    setChecking(true)
    const checked = await checkRpcEndpoint(validated.value)
    setChecking(false)

    if (checked.isErr()) {
      const url = validated.value
      return setError(
        checked.error.reason === 'wrong-chain'
          ? 'This RPC is on a different network.'
          : /^(http|ws):/.test(url) && !isLocal(url)
            ? 'Could not reach this RPC. Plain http/ws is blocked on remote hosts; use https/wss.'
            : 'Could not reach this RPC.',
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
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://…"
          aria-label="RPC URL"
          aria-invalid={error !== null}
          disabled={checking}
        />
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <DialogFooter>
          {current && (
            <Button variant="ghost" onClick={resetCustomRpcUrl}>
              Reset to default
            </Button>
          )}
          <Button onClick={save} disabled={checking}>
            {checking ? 'Checking…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
