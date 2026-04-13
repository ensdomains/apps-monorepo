import { Link } from '@tanstack/react-router'
import type { Address } from 'viem'
import { HubIcon } from '@/assets/icons'
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
      className="h-21.5 px-6 flex flex-row rounded-sm gap-6 items-center border border-border hover:bg-muted"
    >
      <HubIcon className="size-8 shrink-0 text-[#191919] dark:text-[#595755]" />
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
