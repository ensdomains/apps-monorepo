import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { Link } from '@tanstack/react-router'
import type { Address } from 'viem'
import { HubIcon } from '@/assets/icons'
import { sepoliaWithEns } from '@/lib/wagmi'
import type { ProtocolVersion } from '@/utils/types'
import { RegistryLocation } from './RegistryLocation'

const v2EnsRegistry = sepoliaWithEns.contracts.ensRegistry.address

const v1EnsLegacyRegistry = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensLegacyRegistry',
})

export const RegistryCard = ({
  name,
  registryAddress,
  asRow,
  protocolVersion,
}: {
  name: string
  registryAddress?: Address
  asRow?: boolean
  protocolVersion?: ProtocolVersion
}) => {
  const isCustomRegistry =
    registryAddress &&
    registryAddress !== v2EnsRegistry &&
    registryAddress !== v1EnsLegacyRegistry

  const isV1 = protocolVersion === 'ENSv1'

  if (asRow) {
    if (isV1) return null
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
          <span className="text-muted-foreground">None set</span>
        )}
      </Link>
    )
  }

  if (isV1) return null

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
