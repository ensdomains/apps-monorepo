import { NotFoundMessage } from '@/components/NotFoundMessage'
import { DnsClaimableMessage } from '@/features/dns-import/components/DnsClaimableMessage'
import { isClaimable } from '@/utils/ens/tldHelpers'

interface NameNotRegisteredMessageProps {
  readonly name: string
  readonly description: React.ReactNode
}

/**
 * What a `/$name` tab shows when it finds no registry entry for the name.
 *
 * For a DNS 2LD that is no verdict: the name may be unimported, or live
 * off-chain through its `ENS1` record (a gasless name has no registry entry by
 * design), so it gets the overview's DNS message instead of "not registered".
 */
export const NameNotRegisteredMessage = ({
  name,
  description,
}: NameNotRegisteredMessageProps) =>
  isClaimable(name) ? (
    <DnsClaimableMessage name={name} />
  ) : (
    <NotFoundMessage title="Name not registered" description={description} />
  )
