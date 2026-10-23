import { useEffect, useState } from 'react'
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
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setValue(getCustomRpcUrl() ?? '')
    setError(null)
    setIsSaving(false)
  }, [isOpen])

  return { value, setValue, error, setError, isSaving, setIsSaving }
}

export const RpcSettingsDialog = ({
  isOpen,
  onOpenChange,
}: {
  readonly isOpen: boolean
  readonly onOpenChange: (isOpen: boolean) => void
}) => {
  const current = getCustomRpcUrl()
  const { value, setValue, error, setError, isSaving, setIsSaving } =
    useRpcForm(isOpen)

  const save = async (): Promise<void> => {
    setError(null)
    setIsSaving(true)
    // Success reloads the page, so only a failure needs handling here.
    const result = await applyCustomRpc(value)
    if (result.isErr()) {
      setIsSaving(false)
      setError(describeRpcError(result.error, value))
    }
  }

  const reset = async (): Promise<void> => {
    const result = await resetCustomRpcUrl()
    if (result.isErr()) setError(describeRpcError(result.error, value))
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Custom RPC</DialogTitle>
          <DialogDescription>
            Send all chain requests to your own node instead of the default
            providers. Saving reloads the page to check the RPC, then again to
            switch to it.
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
            disabled={isSaving}
          />
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            {current && (
              <Button
                variant="ghost"
                type="button"
                onClick={() => void reset()}
              >
                Reset to default
              </Button>
            )}
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
