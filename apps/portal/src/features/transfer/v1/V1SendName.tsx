import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Info, Lock } from 'lucide-react'
import { match, P } from 'ts-pattern'
import { type Address, isAddressEqual } from 'viem'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  getEth2LDAncestor,
  getParentName,
  is2LD,
  isEthName,
} from '@/utils/ens/tldHelpers'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { SendNameForm } from '../components/SendNameForm'
import { useTransferName } from '../hooks/useTransferName'
import { getEthAddressQueryOptions } from '../queries/getEthAddress'
import type { V1TransferActor, V1TransferSubject } from '../types'
import type { V1NameState } from './getV1NameState'
import { getV1DetachTargets, getV1Holder, getV1ParentPowers } from './rules'

/**
 * The V1 side of the transfer form. Everything here is derived from one
 * `V1NameState` read plus the name's ETH record; the rules are pure functions
 * in `./rules`. `V1Transfer` has already confirmed `account` may move
 * `subject` as `actor`.
 */
export const V1SendName = ({
  name,
  subject,
  actor,
  state: { resolverAddress, parent, ancestorRegistration },
  account,
}: {
  readonly name: string
  readonly subject: V1TransferSubject
  readonly actor: V1TransferActor
  readonly state: V1NameState
  readonly account: Address
}) => {
  const parentName = is2LD(name) ? null : getParentName(name)

  // Only worth reading when there is a resolver of the name's own and the
  // sender could write to it; otherwise the ETH option is hidden whatever the
  // record says.
  const canEditRecords = resolverAddress !== null && actor === 'owner'
  const ethAddressQuery = useQuery({
    ...getEthAddressQueryOptions({ name }),
    enabled: canEditRecords,
  })

  const transfer = useTransferName({ name, account, subject, actor })

  return (
    <SendNameForm
      // Who the name is taken from — sending it back to them is a no-op, and
      // for a parent-initiated move that is a different address than `account`.
      owner={getV1Holder(subject)}
      detachTargets={{
        isOptionVisible: getV1DetachTargets({
          subject,
          actor,
          resolverAddress,
          account,
          hasEthAddress: !!ethAddressQuery.data,
        }),
        // Keyed off `isSuccess`, not `!isLoading`: a failed read must block the
        // transfer rather than read as "no ETH record".
        isSettled: !canEditRecords || ethAddressQuery.isSuccess,
        hasFailed: ethAddressQuery.isError,
      }}
      parentWarning={
        parentName === null
          ? null
          : {
              parentName,
              isLoading: false,
              isError: false,
              // Either role on the parent can act on the subname: the
              // registrant of an unwrapped 2LD can reclaim and then reassign.
              parentIsSelf: [parent?.owner, parent?.registrant].some(
                (address) => address && isAddressEqual(address, account),
              ),
              powers: getV1ParentPowers(name, subject, parent),
            }
      }
      transfer={transfer}
      notices={
        <V1Notices
          name={name}
          subject={subject}
          actor={actor}
          account={account}
          ancestorRegistration={ancestorRegistration}
        />
      }
    />
  )
}

/** Things about how a V1 name is held that change what the transfer does. */
const V1Notices = ({
  name,
  subject,
  actor,
  account,
  ancestorRegistration,
}: {
  readonly name: string
  readonly subject: V1TransferSubject
  readonly actor: V1TransferActor
  readonly account: Address
  readonly ancestorRegistration: V1NameState['ancestorRegistration']
}) => {
  const ancestorName = getEth2LDAncestor(name)
  return (
    <>
      {actor === 'parent' && (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertDescription>
            <p>
              You’re reassigning this subname as the owner of{' '}
              <span className="font-medium">{getParentName(name)}</span>. Its
              current owner ({truncateAddress(getV1Holder(subject))}) loses it
              the moment this lands, and its records stay as they are.
            </p>
          </AlertDescription>
        </Alert>
      )}
      {/* The gate only blocks a grace-period ancestor for the parent's move;
          the holder's still goes through, but into a subtree about to lapse. */}
      {ancestorRegistration === 'gracePeriod' && (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertDescription>
            <p>
              <span className="font-medium">{ancestorName}</span> is in its
              grace period. If it isn’t renewed, whoever registers it next can
              take this subname back from the recipient.
            </p>
          </AlertDescription>
        </Alert>
      )}
      {match(subject)
        // A DNS name's "parent" is the TLD, so the parent alert doesn't apply —
        // but the domain holder can still take it back through the DNSRegistrar,
        // and with it everything underneath.
        .when(
          () => !isEthName(name),
          () => (
            <Alert variant="warning">
              <Info className="size-4" />
              <AlertDescription>
                <p>
                  {is2LD(name)
                    ? 'This is a DNS name. Whoever controls the DNS domain can reclaim it at any time by proving that control on-chain, so transferring it doesn’t give the recipient lasting ownership.'
                    : 'This is a subname of a DNS name. Whoever controls the DNS domain can reclaim the name above it at any time by proving that control on-chain, and with it this subname.'}
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
                  The transfer hands the recipient both the owner and manager
                  roles. Until then only the manager can change records, so the
                  record options aren't available here.
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
                This name is locked in the Name Wrapper. Its burned fuses and
                expiry carry over to the recipient unchanged.
              </p>
            </AlertDescription>
          </Alert>
        ))
        .with(P._, () => null)
        .exhaustive()}
    </>
  )
}
