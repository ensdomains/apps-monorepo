import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useRegistryRepairCase } from '../../hooks/useRegistryRepairCase'
import type { RegistryRepairCase } from '../../utils/registryRepairCase'
import { RegistryPanel } from './RegistryPanel'

const CAN_UPDATE_CASES: readonly RegistryRepairCase[] = ['owns-all', 'shared']

/** Asks an account that can update the name's registry to do so. */
export const RegistryUpdateNotice = ({ name }: { readonly name: string }) => {
  const { repairCase } = useRegistryRepairCase(name)

  if (!CAN_UPDATE_CASES.includes(repairCase)) return null

  return (
    <RegistryPanel>
      <Alert className="p-5 gap-2" variant="warning">
        <AlertTitle>Update required</AlertTitle>
        <AlertDescription>
          This registry runs on an older version that has since been fixed.
          Update it to create subnames or change roles. The existing subnames
          and their settings will carry over.
        </AlertDescription>
      </Alert>
    </RegistryPanel>
  )
}
