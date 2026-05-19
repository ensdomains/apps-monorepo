import type { GetEnsOwnerReturnType } from '@/features/profile/hooks/useEnsOwner'
import { ConfigureRegistryForm } from './ConfigureRegistryForm'
import { RegistryTree } from './RegistryTree'

type V2RegistryInfoProps = {
  name: string
  ownerData: NonNullable<GetEnsOwnerReturnType>
}

export function V2RegistryInfo({ name, ownerData }: V2RegistryInfoProps) {
  return (
    <section className="p-4 gap-4 sm:p-8">
      <h1 className="text-3xl font-medium leading-none">Registry</h1>
      <RegistryTree name={name} ownerData={ownerData} />
      <ConfigureRegistryForm name={name} />
    </section>
  )
}
