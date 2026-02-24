import { ShieldCheck } from 'lucide-react'

export function VerifiedRegistryCard() {
  return (
    <div className="bg-peridot-100 rounded-lg p-4 flex flex-col items-center justify-center gap-4 relative w-full mx-auto my-4">
      <div className="p-4 flex flex-col items-center gap-3">
        <ShieldCheck className="size-6 shrink-0" />
        <p className="text-sm">
          This registry was deployed via the official ENS Registry Factory. This
          registry has been audited and is considered secure.
        </p>
      </div>
    </div>
  )
}
