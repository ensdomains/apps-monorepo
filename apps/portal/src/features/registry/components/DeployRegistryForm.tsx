import { CircleCheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

interface DeployRegistryFormProps {
  useCustomRegistry: boolean
  setUseCustomRegistry: (value: boolean) => void
  contractAddress: string
  setContractAddress: (value: string) => void
  migrateSubnames: boolean
  setMigrateSubnames: (value: boolean) => void
  onSubmit: () => void
  isSubmitDisabled: boolean
  buttonText: string
}

export const DeployRegistryForm = ({
  useCustomRegistry,
  setUseCustomRegistry,
  contractAddress,
  setContractAddress,
  migrateSubnames,
  setMigrateSubnames,
  onSubmit,
  isSubmitDisabled,
  buttonText,
}: DeployRegistryFormProps) => {
  return (
    <>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <Switch
            checked={useCustomRegistry}
            onCheckedChange={setUseCustomRegistry}
            id="use-custom-registry"
          />
          <Label htmlFor="use-custom-registry" className="cursor-pointer">
            Use custom registry
          </Label>
        </div>
        {!useCustomRegistry && (
          <span className="text-sm text-muted-foreground">
            Deploy a new verified subregistry.
          </span>
        )}
      </div>

      {useCustomRegistry && (
        <div className="flex flex-col gap-3">
          <Label
            htmlFor="contract-address"
            info="The address of the custom registry contract"
          >
            Contract address
          </Label>
          <Input
            id="contract-address"
            placeholder="HEX address or ENS name"
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
          />
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <Switch
            checked={migrateSubnames}
            onCheckedChange={setMigrateSubnames}
            className="shrink-0"
            id="migrate-subnames"
          />
          <Label htmlFor="migrate-subnames" className="cursor-pointer">
            Migrate subnames
          </Label>
        </div>
        <span className="text-sm text-muted-foreground">
          All subnames on your current subregistry will be lost.
        </span>
      </div>

      <Button onClick={onSubmit} disabled={isSubmitDisabled} className="w-fit">
        <span className="flex items-center gap-2">
          <CircleCheckIcon className="size-4" />
          {buttonText}
        </span>
      </Button>
    </>
  )
}
