import { InfoIcon } from 'lucide-react'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type RegistrationOptionalSettingsItemProps<T> = {
  label: string
  tooltipText: string
  value: T
  onChange: (value: T) => void
}

const RegistrationOptionalSettingsItem = <T,>({
  label,
  tooltipText,
  value,
  onChange,
}: RegistrationOptionalSettingsItemProps<T>) => {
  // NOTE : This is a temporary component UI - ideally this would not be a genric component
  // since each settings have a unique set of update logics and validations
  return (
    <div className="flex items-center gap-2 border border-border rounded-lg p-4 justify-between">
      <div className="flex items-center gap-2">
        <Label className="text-primary" htmlFor={label}>
          {label}
        </Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <InfoIcon className="size-3" />
          </TooltipTrigger>
          <TooltipContent className="max-w-52" side="top">
            {tooltipText}
          </TooltipContent>
        </Tooltip>
      </div>
      {typeof value === 'boolean' ? (
        <div>
          <Switch
            id={label}
            checked={value as boolean}
            onCheckedChange={onChange as (checked: boolean) => void}
          />
        </div>
      ) : (
        <div>
          <Input
            id={label}
            value={value as string}
            onChange={(e) => onChange(e.target.value as T)}
          />
        </div>
      )}
    </div>
  )
}

export const RegistrationOptionalSettings = () => {
  // mock states to finish up the UI - will be replaced with actual states in the next iteration
  const [setAsDefaultPrimaryName, setSetAsDefaultPrimaryName] = useState(false)
  // const [nameOwner, setNameOwner] = useState<string>(
  //   '0x0000000000000000000000000000000000000000',
  // )
  // const [resolver, setResolver] = useState<string>(
  //   '0x0000000000000000000000000000000000000000',
  // )
  // const [nameRoles, setNameRoles] = useState<string[]>([])
  // const [subregistryAddress, setSubregistryAddress] = useState<string>()

  return (
    <section className="flex flex-col gap-2">
      <h5 className="text-base font-medium">Optional Settings</h5>
      <div className="flex flex-col gap-2">
        <RegistrationOptionalSettingsItem
          label="Set as default primary name"
          tooltipText="Set this name as your default primary name. This will be used as your primary name in all your transactions and interactions."
          value={setAsDefaultPrimaryName}
          onChange={setSetAsDefaultPrimaryName}
        />
        {/* <RegistrationOptionalSettingsItem
          label="Name owner"
          tooltipText="Set the owner of this name. This will be the address that can control the name."
          value={nameOwner}
          onChange={setNameOwner}
        />
        <RegistrationOptionalSettingsItem
          label="Resolver"
          tooltipText="Set the resolver for this name. This will be the address that can resolve the name."
          value={resolver}
          onChange={setResolver}
        />
        <RegistrationOptionalSettingsItem
          label="Name roles"
          tooltipText="Set the roles for this name. This will be the roles that can control the name."
          value={nameRoles}
          onChange={setNameRoles}
        />
        <RegistrationOptionalSettingsItem
          label="Subregistry address"
          tooltipText="Set the subregistry address for this name. This will be the subregistry address that can control the name."
          value={subregistryAddress}
          onChange={setSubregistryAddress}
        /> */}
      </div>
    </section>
  )
}
