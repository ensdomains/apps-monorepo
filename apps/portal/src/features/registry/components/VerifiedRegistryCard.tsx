import { ShieldCheck } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'

export function VerifiedRegistryCard() {
  return (
    <Alert
      variant="success"
      className="my-4 flex flex-col items-center gap-3 border-none p-8 [&>svg]:size-6"
    >
      <ShieldCheck />
      <AlertDescription className="block text-center">
        This registry was deployed via the official ENS Registry Factory. This
        registry has been audited and is considered secure.
      </AlertDescription>
    </Alert>
  )
}
