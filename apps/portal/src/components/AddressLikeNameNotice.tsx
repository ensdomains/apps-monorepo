import { AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

/** Shown above the pages of a name that reads like a wallet address. */
export const AddressLikeNameNotice = () => (
  <Alert variant="warning">
    <AlertTriangle />
    <AlertTitle>This name looks like a wallet address</AlertTitle>
    <AlertDescription>
      Note: This name may resolve to another address, confirm the final address
      is the intended address.
    </AlertDescription>
  </Alert>
)
