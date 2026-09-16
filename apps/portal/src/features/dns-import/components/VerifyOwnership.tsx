import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Fuel, KeyRound } from 'lucide-react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { Button } from '@/components/ui/button'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getPrimaryNameQueryOptions } from '@/features/profile/hooks/usePrimaryName'
import { EstimatedGasCost } from '@/features/transaction-manager/components/EstimatedGasCost'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useConnectModal } from '@/features/wallet/ConnectModalProvider'
import { sepoliaWithEns } from '@/lib/wagmi'
import { getTLD } from '@/utils/ens/tldHelpers'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { DNS_TXT_RECORD_HELPER_LINKS } from '../constants'
import {
  DNS_ERROR_MESSAGES,
  type DnsErrorKind,
  deriveVerificationState,
  dnsErrorToKind,
} from '../helpers/dnsImportStates'
import {
  type DnsRecordSpec,
  getOffchainVerificationRecord,
  getOnchainVerificationRecord,
} from '../helpers/records'
import { useDnsImportTransactions } from '../hooks/useDnsImportTransactions'
import {
  type DnsOffchainStatus,
  getDnsOffchainStatusQueryOptions,
} from '../queries/getDnsOffchainStatus'
import { getDnsOwnerQueryOptions } from '../queries/getDnsOwner'
import { getIsPublicSuffixQueryOptions } from '../queries/getIsPublicSuffix'
import type { DnsImportType } from '../types'
import { DnsRecordTable } from './DnsRecordTable'
import { SupportLinkList } from './SupportLinkList'
import {
  RefreshButton,
  StatusChip,
  StepActions,
  StepDangerCard,
  StepHeadingCard,
  StepSuccessCard,
} from './shared'

/** What the DNS check found, unified across the offchain and onchain paths. */
type FoundState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'none' }
  | { readonly kind: 'invalid'; readonly reason: DnsErrorKind }
  | {
      readonly kind: 'mismatch'
      readonly foundAddress: Address
      readonly unofficialResolver?: boolean
    }
  | { readonly kind: 'verified' }

const MISMATCH_DESCRIPTION =
  'The record found does not match your connected address. You can still import this name, but it will not point to your connected address and cannot be used as your primary name.'

const foundFromError = (error: { cause: unknown }): FoundState => {
  const reason = dnsErrorToKind(error.cause)
  return reason === 'noTxtRecord'
    ? { kind: 'none' }
    : { kind: 'invalid', reason }
}

const deriveOffchainFound = (
  query: {
    readonly isLoading: boolean
    readonly error: { cause: unknown } | null
    readonly data: DnsOffchainStatus | null | undefined
  },
  connectedAddress: Address | undefined,
): FoundState => {
  if (query.isLoading) return { kind: 'loading' }
  if (query.error) return foundFromError(query.error)
  const status = query.data
  if (!status) return { kind: 'none' }
  // Record exists but the name doesn't resolve to an address through it.
  if (!status.resolvedAddress) return { kind: 'invalid', reason: 'unknown' }
  const state = deriveVerificationState({
    connectedAddress,
    dnsAddress: status.resolvedAddress,
  })
  return state.kind === 'mismatch'
    ? { ...state, unofficialResolver: !status.resolverIsOfficial }
    : state
}

const deriveOnchainFound = (
  query: {
    readonly isLoading: boolean
    readonly error: { cause: unknown } | null
    readonly data: Address | null | undefined
  },
  connectedAddress: Address | undefined,
): FoundState => {
  if (query.isLoading) return { kind: 'loading' }
  if (query.error) return foundFromError(query.error)
  return deriveVerificationState({
    connectedAddress,
    dnsAddress: query.data,
  })
}

const deriveFound = ({
  type,
  connectedAddress,
  offchainQuery,
  dnsOwnerQuery,
}: {
  readonly type: DnsImportType
  readonly connectedAddress: Address | undefined
  readonly offchainQuery: Parameters<typeof deriveOffchainFound>[0]
  readonly dnsOwnerQuery: Parameters<typeof deriveOnchainFound>[0]
}): FoundState => {
  if (!connectedAddress) return { kind: 'loading' }
  return type === 'offchain'
    ? deriveOffchainFound(offchainQuery, connectedAddress)
    : deriveOnchainFound(dnsOwnerQuery, connectedAddress)
}

const buildRecord = (
  type: DnsImportType,
  connectedAddress: Address | undefined,
): DnsRecordSpec | null => {
  if (!connectedAddress) return null
  return type === 'offchain'
    ? getOffchainVerificationRecord(sepoliaWithEns.id, connectedAddress)
    : getOnchainVerificationRecord(connectedAddress)
}

/** Record table + found chip + per-state messages while ownership is unverified. */
const VerificationDetails = ({
  found,
  record,
  onRefresh,
  isRefreshing,
}: {
  readonly found: FoundState
  readonly record: DnsRecordSpec
  readonly onRefresh: () => void
  readonly isRefreshing: boolean
}) => (
  <>
    <DnsRecordTable
      record={record}
      foundRow={
        <div className="flex w-full items-center gap-3">
          <div className="flex-1">
            {match(found)
              .with({ kind: 'loading' }, () => (
                <span className="text-muted-foreground">Checking…</span>
              ))
              .with({ kind: 'none' }, () => (
                <StatusChip tone="warning" className="w-fit">
                  None
                </StatusChip>
              ))
              .with({ kind: 'invalid' }, () => (
                <StatusChip tone="danger" className="w-fit">
                  Invalid
                </StatusChip>
              ))
              .with({ kind: 'mismatch' }, ({ foundAddress }) => (
                <StatusChip tone="success" className="w-fit">
                  {truncateAddress(foundAddress)}
                </StatusChip>
              ))
              .otherwise(() => null)}
          </div>
          <RefreshButton onClick={onRefresh} isRefreshing={isRefreshing} />
        </div>
      }
    />
    {found.kind === 'invalid' && (
      <p className="text-sm text-message-danger-text">
        {DNS_ERROR_MESSAGES[found.reason]}
      </p>
    )}
    {found.kind === 'mismatch' && found.unofficialResolver && (
      <p className="text-sm text-message-warning-text">
        The record found points at an unofficial resolver — the name may not
        resolve as expected.
      </p>
    )}
    {found.kind === 'mismatch' && (
      <StepDangerCard
        title="Record does not match"
        description={MISMATCH_DESCRIPTION}
      />
    )}
    <SupportLinkList
      title="Registrar guides for adding a TXT record:"
      items={DNS_TXT_RECORD_HELPER_LINKS}
    />
  </>
)

export const VerifyOwnership = ({
  name,
  type,
  onBack,
}: {
  readonly name: string
  readonly type: DnsImportType
  readonly onBack: () => void
}) => {
  const { address: connectedAddress } = useConnection()
  const { openConnectModal } = useConnectModal()
  const isConnected = !!connectedAddress

  const offchainQuery = useQuery({
    ...getDnsOffchainStatusQueryOptions({ name }),
    enabled: isConnected && type === 'offchain',
  })
  const dnsOwnerQuery = useQuery({
    ...getDnsOwnerQueryOptions({ name, strict: true }),
    enabled: isConnected && type === 'onchain',
  })
  const suffixQuery = useQuery({
    ...getIsPublicSuffixQueryOptions({ tld: getTLD(name) }),
    enabled: type === 'onchain',
  })

  const activeQuery = type === 'offchain' ? offchainQuery : dnsOwnerQuery

  const found = deriveFound({
    type,
    connectedAddress,
    offchainQuery,
    dnsOwnerQuery,
  })
  const record = buildRecord(type, connectedAddress)

  if (type === 'onchain' && suffixQuery.data === false) {
    return (
      <div className="flex flex-col gap-4">
        <StepDangerCard
          title="Domain not supported"
          description={
            <>
              The <strong>.{getTLD(name)}</strong> domain ending is not
              supported by the DNS registrar for onchain import.
            </>
          }
        />
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {found.kind === 'verified' ? (
        <StepSuccessCard
          title="Ownership verified"
          description="A record matching your connected address was found."
        />
      ) : (
        <StepHeadingCard
          title="Verify ownership"
          description="Add the DNS record below to verify your ownership of this domain."
        />
      )}

      {!isConnected ? (
        <>
          <StatusChip tone="warning">
            Connect your wallet to verify ownership of this domain.
          </StatusChip>
          <Button className="w-full" onClick={() => openConnectModal()}>
            Connect
          </Button>
        </>
      ) : (
        <>
          {found.kind !== 'verified' && record && (
            <VerificationDetails
              found={found}
              record={record}
              onRefresh={() => void activeQuery.refetch()}
              isRefreshing={activeQuery.isRefetching}
            />
          )}

          {type === 'offchain' ? (
            <OffchainActions name={name} found={found} onBack={onBack} />
          ) : (
            <OnchainImportActions
              name={name}
              found={found}
              dnsOwner={dnsOwnerQuery.data ?? null}
              onBack={onBack}
            />
          )}
        </>
      )}
    </div>
  )
}

/**
 * The gasless path's actions: no transaction — "Finish" just refreshes the
 * name's owner data and returns to the overview. Allowed on a mismatching
 * record too (red button), matching the design and ens-app-v3.
 */
const OffchainActions = ({
  name,
  found,
  onBack,
}: {
  readonly name: string
  readonly found: FoundState
  readonly onBack: () => void
}) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const finishOffchain = () => {
    void queryClient.invalidateQueries({
      queryKey: getEnsOwnerQueryOptions({ name }).queryKey,
    })
    void navigate({ to: '/$name', params: { name } })
  }

  return (
    <StepActions
      onBack={onBack}
      primary={match(found)
        .with({ kind: 'verified' }, () => ({
          label: 'Finish',
          onClick: finishOffchain,
        }))
        .with({ kind: 'mismatch' }, () => ({
          label: 'Finish',
          onClick: finishOffchain,
          tone: 'danger' as const,
        }))
        .otherwise(() => ({
          label: 'Claim',
          onClick: () => {},
          disabled: true,
        }))}
    />
  )
}

/**
 * The onchain path's final section: once a record is found, shows the
 * estimated gas cost + the owner the name will be claimed for, and drives the
 * import transaction(s) through the shared modal.
 */
const OnchainImportActions = ({
  name,
  found,
  dnsOwner,
  onBack,
}: {
  readonly name: string
  readonly found: FoundState
  readonly dnsOwner: Address | null
  readonly onBack: () => void
}) => {
  const isActionable = found.kind === 'verified' || found.kind === 'mismatch'
  const mode = found.kind === 'verified' ? 'claim' : 'importWithoutOwnership'

  const { transactions, startImport, isReady } = useDnsImportTransactions({
    name,
    mode,
    enabled: isActionable,
  })

  const ownerQuery = useQuery(getPrimaryNameQueryOptions(dnsOwner ?? undefined))
  const claimStep = transactions[transactions.length - 1]

  return (
    <>
      {isActionable && (
        <div className="rounded-xl border p-6 flex flex-col gap-4 text-sm">
          <div className="flex items-center gap-6">
            <span className="w-24 shrink-0 text-muted-foreground inline-flex items-center gap-1.5">
              <Fuel className="size-4" /> Gas cost
            </span>
            <span className="font-mono">
              <EstimatedGasCost actor={undefined} intent={claimStep?.intent} />
            </span>
          </div>
          <div className="flex items-center gap-6">
            <span className="w-24 shrink-0 text-muted-foreground inline-flex items-center gap-1.5">
              <KeyRound className="size-4" /> Owner
            </span>
            <span className="font-mono">
              {dnsOwner ? (ownerQuery.data ?? truncateAddress(dnsOwner)) : '—'}
            </span>
          </div>
        </div>
      )}
      <StepActions
        onBack={onBack}
        primary={match(found)
          .with({ kind: 'verified' }, () => ({
            label: 'Import',
            onClick: startImport,
            disabled: !isReady,
          }))
          .with({ kind: 'mismatch' }, () => ({
            label: 'Import without ownership',
            onClick: startImport,
            disabled: !isReady,
            tone: 'danger' as const,
          }))
          .otherwise(() => ({
            label: 'Import',
            onClick: () => {},
            disabled: true,
          }))}
      />
      <TransactionModal transactions={transactions} />
    </>
  )
}
