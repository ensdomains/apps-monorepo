import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'
import { useState } from 'react'
import { isAddress } from 'viem'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type RolePermissions = {
  manager: boolean
  admin: boolean
}

type RolesFormData = {
  user: string
  registrar: RolePermissions
  renew: RolePermissions
  setSubregistry: RolePermissions
  setResolver: RolePermissions
  setTokenObserver: RolePermissions
  burn: RolePermissions
  canTransferAdmin: RolePermissions
}

const roleDefinitions = [
  {
    key: 'registrar' as const,
    title: 'Registrar',
    description: 'Can register new names',
  },
  {
    key: 'renew' as const,
    title: 'Renew',
    description: 'Can renew name registrations',
  },
  {
    key: 'setSubregistry' as const,
    title: 'Set Subregistry',
    description: 'Can change subregistry addresses',
  },
  {
    key: 'setResolver' as const,
    title: 'Set Resolver',
    description: 'Can change the resolver addresses',
  },
  {
    key: 'setTokenObserver' as const,
    title: 'Set Token Observer',
    description: 'Can set token observer contracts',
  },
  {
    key: 'burn' as const,
    title: 'Burn',
    description: 'Can burn (delete) the name',
  },
  {
    key: 'canTransferAdmin' as const,
    title: 'Can Transfer Admin',
    description: 'Can grant/revoke transfer admin rights',
  },
] as const satisfies {
  key: keyof Omit<RolesFormData, 'user'>
  title: string
  description: string
}[]

export const Route = createFileRoute('/$name/add-user')({
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = useParams({ from: '/$name/add-user' })
  const [formData, setFormData] = useState<RolesFormData>({
    user: '',
    registrar: { manager: false, admin: false },
    renew: { manager: false, admin: false },
    setSubregistry: { manager: false, admin: false },
    setResolver: { manager: false, admin: false },
    setTokenObserver: { manager: false, admin: false },
    burn: { manager: false, admin: false },
    canTransferAdmin: { manager: false, admin: false },
  })
  const [userInputError, setUserInputError] = useState<string | null>(null)

  const isValidEnsName = (input: string): boolean => {
    // Basic ENS name validation: should end with .eth and have at least one character before it
    return /^[a-z0-9-]+\.eth$/.test(input.toLowerCase())
  }

  const handleUserInputChange = (value: string) => {
    setFormData((prev) => ({ ...prev, user: value }))

    if (value.trim() === '') {
      setUserInputError(null)
      return
    }

    // Check if it's a valid address or ENS name
    if (isAddress(value)) {
      setUserInputError(null)
    } else if (isValidEnsName(value)) {
      setUserInputError(null)
    } else {
      setUserInputError('Please enter a valid ENS name or HEX address')
    }
  }

  const handleRoleChange = (
    roleKey: keyof Omit<RolesFormData, 'user'>,
    permission: 'manager' | 'admin',
    checked: boolean,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [roleKey]: {
        ...prev[roleKey],
        [permission]: checked,
      },
    }))
  }

  const handleSubmit = () => {
    if (!formData.user.trim() || userInputError) {
      return
    }

    // Here you would handle the form submission
    console.log('Form submitted:', formData)
    // TODO: Implement actual submission logic
  }

  const isFormValid = formData.user.trim() !== '' && !userInputError

  return (
    <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
      <Link to="/$name/roles" params={{ name }}>
        <Button variant="ghost" className="flex items-center gap-2 -ml-2">
          <ArrowLeftIcon className="size-4" />
          Back
        </Button>
      </Link>

      <h1 className="text-[28px] font-medium leading-none">Add user</h1>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="user">User</Label>
          <Input
            id="user"
            placeholder="ENS name or HEX address"
            value={formData.user}
            onChange={(e) => handleUserInputChange(e.target.value)}
            className={userInputError ? 'border-red-500' : ''}
          />
          {userInputError && (
            <p className="text-sm text-red-500">{userInputError}</p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">Roles</h2>
          <div className="border rounded-lg divide-y">
            {roleDefinitions.map((role) => (
              <div
                key={role.key}
                className="flex items-center justify-between p-4 gap-4"
              >
                <div className="flex flex-col gap-1 flex-1">
                  <div className="font-medium">{role.title}</div>
                  <div className="text-sm text-gray-600">
                    {role.description}
                  </div>
                </div>
                <div className="flex items-center gap-8">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`${role.key}-manager`}
                      checked={formData[role.key].manager}
                      onCheckedChange={(checked) =>
                        handleRoleChange(role.key, 'manager', checked === true)
                      }
                    />
                    <Label
                      htmlFor={`${role.key}-manager`}
                      className="font-normal cursor-pointer text-gray-600"
                    >
                      Manager
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`${role.key}-admin`}
                      checked={formData[role.key].admin}
                      onCheckedChange={(checked) =>
                        handleRoleChange(role.key, 'admin', checked === true)
                      }
                    />
                    <Label
                      htmlFor={`${role.key}-admin`}
                      className="font-normal cursor-pointer text-gray-600"
                    >
                      Admin
                    </Label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!isFormValid}
          className="w-fit"
        >
          Save roles
        </Button>
      </div>
    </div>
  )
}
