import type { GetEnsOwnerReturnType } from '@/features/profile/hooks/useEnsOwner'
import { RegistryHistory } from './RegistryHistory'
import { RegistryTree } from './RegistryTree'

type V2RegistryInfoProps = {
  name: string
  ownerData: NonNullable<GetEnsOwnerReturnType>
}

export function V2RegistryInfo({ name, ownerData }: V2RegistryInfoProps) {
  return (
    <section className="flex flex-col p-4 gap-4 sm:p-8">
      <h1 className="text-h1">Registry</h1>
      <RegistryTree name={name} ownerData={ownerData} />
      <RegistryHistory name={name} />
    </section>
  )
}
