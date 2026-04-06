import { Link } from '@tanstack/react-router'
import { Network } from 'lucide-react'
import type { Address } from 'viem'
import { sepoliaWithEns } from '@/lib/wagmi'
import { RegistryLocation } from './RegistryLocation'

const v1EnsRegistry = sepoliaWithEns.contracts.ensRegistry.address

export const RegistryCard = ({
  name,
  registryAddress,
}: {
  name: string
  registryAddress?: Address
}) => {
  const isCustomRegistry = registryAddress && registryAddress !== v1EnsRegistry

  return (
    <Link
      to="/$name/registry"
      params={{ name }}
      className="p-6 flex flex-row rounded-2xl gap-6 items-center border border-border hover:bg-muted"
    >
      <Network className="size-10 shrink-0 text-muted-foreground" />
      {isCustomRegistry ? (
        <RegistryLocation name={name} registryAddress={registryAddress} />
      ) : (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Subregistry</span>
          <span className="text-muted-foreground">None set</span>
        </div>
      )}
    </Link>
  )
}
