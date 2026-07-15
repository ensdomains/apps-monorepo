import { Input } from '@/components/ui/input'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import type { AddressResolution } from '../hooks/useAddressResolution'

type AddressNameInputProps = {
  /** Raw, untrimmed input value (controlled). */
  readonly value: string
  readonly onChange: (value: string) => void
  /** Resolution derived from `value` via `useAddressResolution`. */
  readonly resolution: AddressResolution
  readonly id?: string
  readonly name?: string
  readonly placeholder?: string
  readonly disabled?: boolean
  readonly required?: boolean
  readonly className?: string
  readonly 'aria-label'?: string
}

/**
 * Standard "ENS name or address" text field: an `<Input>` plus a status line
 * (resolving / resolved / could-not-resolve). Owns no resolution logic — the
 * caller runs `useAddressResolution(value)` and passes the result in, so it can
 * gate its own submit button on `resolution.address` / `resolution.isResolving`.
 */
export const AddressNameInput = ({
  value,
  onChange,
  resolution,
  className,
  placeholder = 'ENS name or address',
  ...inputProps
}: AddressNameInputProps) => {
  const { status, address, isRawAddress } = resolution
  const isInvalid = status === 'invalid' || status === 'unresolved'

  return (
    <>
      <Input
        {...inputProps}
        value={value}
        placeholder={placeholder}
        aria-invalid={isInvalid}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.currentTarget.value)}
        className={className}
      />
      {status === 'resolving' && (
        <p className="text-sm mt-1.5 text-muted-foreground">
          Resolving address…
        </p>
      )}
      {status === 'resolved' && address && (
        <p className="text-sm mt-1.5 text-muted-foreground">
          {isRawAddress
            ? `Using address: ${truncateAddress(address, 6, 4)}`
            : `Resolved: ${truncateAddress(address, 6, 4)}`}
        </p>
      )}
      {status === 'unresolved' && (
        <p className="text-sm mt-1.5 text-danger">
          Could not resolve an address for “{value.trim()}”
        </p>
      )}
    </>
  )
}
