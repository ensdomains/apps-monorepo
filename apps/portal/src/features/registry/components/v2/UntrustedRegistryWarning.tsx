import { useQuery } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Address } from 'viem'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { PrivilegeWarningBadge } from '@/features/roles/components/PrivilegeWarningBadge'
import { getIsUntrustedRegistryQueryOptions } from '../../hooks/useIsUntrustedRegistry'

// Advisory, like the privilege badges: a pending or failed read renders nothing.

const UNTRUSTED_REASON =
  "It runs a UserRegistry implementation ENS no longer trusts. Whoever can upgrade it could have swapped in other code and back, so its subnames and roles can't be verified."

export const UntrustedRegistryBadge = ({
  address,
}: {
  readonly address: Address
}) => {
  const { data: isUntrusted } = useQuery(
    getIsUntrustedRegistryQueryOptions({ address }),
  )

  return isUntrusted ? (
    <PrivilegeWarningBadge
      label="Untrusted registry"
      reason={UNTRUSTED_REASON}
    />
  ) : null
}

export const UntrustedRegistryAlert = ({
  address,
  children,
}: {
  readonly address: Address
  /** What the reader should do about it where the alert is shown. */
  readonly children: ReactNode
}) => {
  const { data: isUntrusted } = useQuery(
    getIsUntrustedRegistryQueryOptions({ address }),
  )

  return isUntrusted ? (
    <Alert className="p-5 gap-2" variant="destructive">
      <TriangleAlert className="size-4" />
      <AlertTitle>Untrusted registry</AlertTitle>
      <AlertDescription>
        <p>{UNTRUSTED_REASON}</p>
        <p>{children}</p>
      </AlertDescription>
    </Alert>
  ) : null
}
