import { Link } from '@tanstack/react-router'
import type { Address } from 'viem'
import { HubIcon } from '@/assets/icons'
import { sepoliaWithEns } from '@/lib/wagmi'
import { RegistryLocation } from './RegistryLocation'

const v1EnsRegistry = sepoliaWithEns.contracts.ensRegistry.address

export const RegistryCard = ({
  name,
  registryAddress,
  asRow,
}: {
  name: string
  registryAddress?: Address
  asRow?: boolean
}) => {
  const isCustomRegistry = registryAddress && registryAddress !== v1EnsRegistry

  if (asRow) {
    return (
      <Link
        to="/$name/registry"
        params={{ name }}
        className="flex items-center gap-4 py-3 hover:bg-muted/50"
      >
        <HubIcon className="size-4 shrink-0 text-icon-foreground" />
        <span className="text-sm text-muted-foreground w-24 shrink-0">
          Subregistry
        </span>
        {isCustomRegistry ? (
          <RegistryLocation name={name} registryAddress={registryAddress} />
        ) : (
          <span className="text-sm text-muted-foreground">None set</span>
        )}
      </Link>
    )
  }

  return (
    <Link
      to="/$name/registry"
      params={{ name }}
      className="h-21.5 px-6 flex flex-row rounded-sm gap-6 items-center border border-border hover:bg-muted"
    >
      <HubIcon className="size-8 shrink-0 text-icon-foreground" />
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
