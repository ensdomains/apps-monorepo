import { PageHeading } from '@/components/PageHeading'
import { NameEventsHistory } from '@/components/table/NameEventsHistory/NameEventsHistory'
import type { GetEnsOwnerReturnType } from '@/features/profile/hooks/useEnsOwner'
import { RegistryHistory } from './RegistryHistory'
import { RegistryTree } from './RegistryTree'

type V2RegistryInfoProps = {
  name: string
  ownerData: NonNullable<GetEnsOwnerReturnType>
}

export function V2RegistryInfo({ name, ownerData }: V2RegistryInfoProps) {
  return (
    <section className="flex flex-col gap-8">
      <PageHeading parent={{ type: 'name', name }}>Registry</PageHeading>
      <RegistryTree name={name} ownerData={ownerData} />
      {/* V1 names have no registry of their own whose history bigname can
          serve, so show the name's registration history instead. */}
      {ownerData.protocolVersion === 'ENSv1' ? (
        <NameEventsHistory name={name} category="registration" />
      ) : (
        <RegistryHistory name={name} />
      )}
    </section>
  )
}
