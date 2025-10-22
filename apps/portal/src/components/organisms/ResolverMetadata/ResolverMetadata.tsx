import { ResolverField } from '@/components/resolver/ResolverField'

export const ResolverMetadata = () => {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      <ResolverField
        label="Verifier contract address"
        value="0x5FB27553ee1e7C86C9fD4863a94A9f755B688bB8"
      />
    </div>
  )
}
