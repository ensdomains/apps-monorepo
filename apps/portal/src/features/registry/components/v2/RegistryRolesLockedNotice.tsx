import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export const RegistryRolesLockedNotice = () => (
  <Alert className="p-5 gap-2" variant="warning">
    <AlertTitle>Update required</AlertTitle>
    <AlertDescription>
      This registry runs on an older version that has since been fixed. Its
      roles can't be changed until it's updated.
    </AlertDescription>
  </Alert>
)
