import { useQuery } from '@tanstack/react-query'
import { Info, Lock } from 'lucide-react'
import { match, P } from 'ts-pattern'
import { type Address, isAddressEqual } from 'viem'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { getParentName, is2LD, isEthName } from '@/utils/ens/tldHelpers'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { SendNameForm } from '../components/SendNameForm'
import { useTransferName } from '../hooks/useTransferName'
import { getEthAddressQueryOptions } from '../queries/getEthAddress'
import type { V1TransferSubject } from '../types'
import type { V1NameState } from './getV1NameState'
import { getV1DetachTargets, getV1ParentPowers } from './rules'

/**
 * The V1 side of the transfer form. Everything here is derived from one
 * `V1NameState` read plus the name's ETH record; the rules are pure functions
 * in `./rules`. `V1Transfer` has already confirmed `account` may move
 * `subject`.
 */
export const V1SendName = ({
  name,
  subject,
  resolverAddress,
  parentOwner,
  account,
}: Pick<V1NameState, 'resolverAddress' | 'parentOwner'> & {
  readonly name: string
  readonly subject: V1TransferSubject
  readonly account: Address
}) => {
  const parentName = is2LD(name) ? null : getParentName(name)

  const ethAddressQuery = useQuery(getEthAddressQueryOptions(name))

  const transfer = useTransferName({ name, account, subject })

  return (
    <SendNameForm
      owner={account}
      detachTargets={{
        optionIsVisible: getV1DetachTargets({
          subject,
          resolverAddress,
          account,
          hasEthAddress: !!ethAddressQuery.data,
        }),
        // Keyed off `isSuccess`, not `!isLoading`: a failed read must block the
        // transfer rather than read as "no ETH record".
        settled: ethAddressQuery.isSuccess,
        failed: ethAddressQuery.isError,
      }}
      parentWarning={
        parentName === null
          ? null
          : {
              parentName,
              isLoading: false,
              isError: false,
              parentIsSelf:
                parentOwner !== null && isAddressEqual(parentOwner, account),
              powers: getV1ParentPowers(name, subject),
            }
      }
      transfer={transfer}
      notices={<V1Notices name={name} subject={subject} account={account} />}
    />
  )
}

/** Things about how a V1 name is held that change what the transfer does. */
const V1Notices = ({
  name,
  subject,
  account,
}: {
  readonly name: string
  readonly subject: V1TransferSubject
  readonly account: Address
}) =>
  match(subject)
    // A DNS name's "parent" is the TLD, so the parent alert doesn't apply — but
    // the domain holder can still take it back through the DNSRegistrar.
    .when(
      () => is2LD(name) && !isEthName(name),
      () => (
        <Alert variant="warning">
          <Info className="size-4" />
          <AlertDescription>
            <p>
              This is a DNS name. Whoever controls the DNS domain can reclaim it
              at any time by proving that control on-chain, so transferring it
              doesn't give the recipient lasting ownership.
            </p>
          </AlertDescription>
        </Alert>
      ),
    )
    .with(
      { kind: 'v1-registrar' },
      ({ controller }) =>
        controller === null || !isAddressEqual(controller, account),
      ({ controller }) => (
        <Alert variant="neutral">
          <Info className="size-4" />
          <AlertDescription>
            <p>
              {controller
                ? `Another wallet (${truncateAddress(controller)}) manages this name's records and subnames. `
                : 'This name currently has no manager. '}
              The transfer hands the recipient both the owner and manager roles.
              Until then only the manager can change records, so the record
              options aren't available here.
            </p>
          </AlertDescription>
        </Alert>
      ),
    )
    .with({ kind: 'v1-wrapped', fuses: { cannotUnwrap: true } }, () => (
      <Alert variant="neutral">
        <Lock className="size-4" />
        <AlertDescription>
          <p>
            This name is locked in the Name Wrapper. Its burned fuses and expiry
            carry over to the recipient unchanged.
          </p>
        </AlertDescription>
      </Alert>
    ))
    .with(P._, () => null)
    .exhaustive()
