import { Link } from '@tanstack/react-router'
import { disconnect } from '@wagmi/core'
import { useConnection, useEnsName } from 'wagmi'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { wagmiConfig } from '@/lib/wagmi'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { CopyableRecord } from '../../../components/CopyableRecord'
import { Button } from '../../../components/ui/button'
import { NameProfileCard } from '../../profile/components/NameProfileCard'

export const DashboardProfilePreview = () => {
  const { address } = useConnection()

  const {
    data: name,
    isLoading,
    error,
  } = useEnsName({
    address,
  })

  if (error) return <div>Error loading profile: {error.message}</div>
  if (isLoading) return <LoadingSpinner title="Loading..." />

  if (address) {
    return (
      <section className="flex flex-col gap-6">
        <div className="flex flex-row flex-wrap gap-2 justify-between items-center">
          <div className="flex flex-row gap-2 items-baseline">
            <span className="font-mono text-quartz-500 font-medium min-w-30">
              Connected as
            </span>

            <CopyableRecord
              className="font-mono text-quartz-500 font-medium"
              value={address}
              displayValue={truncateAddress(address, 6, 4, '...')}
              href={`/addr/${address}`}
            />
          </div>
          <Button
            onClick={() => disconnect(wagmiConfig)}
            variant="secondary"
            className="w-max"
          >
            Disconnect
          </Button>
        </div>
        {name && (
          <Link to="/$name" params={{ name }}>
            <NameProfileCard name={name} />
          </Link>
        )}
      </section>
    )
  } else return null
}
