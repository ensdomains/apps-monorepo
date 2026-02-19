import type { Role } from '@ensdomains/ensjs/utils/v2'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { type Address, isAddress } from 'viem'
import { getEnsAddress } from 'viem/actions'
import { useWalletClient } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useGrantRoles } from '@/features/roles/hooks/useGrantRoles'
import { permissions } from '@/lib/roles/permissions'
import { cn } from '@/lib/utils'
import { namechainSepolia, wagmiConfig } from '@/lib/wagmi'

export const Route = createFileRoute('/$name/roles/add-user')({
  component: RouteComponent,
})

const client = wagmiConfig.getClient({ chainId: namechainSepolia.id })

function RouteComponent() {
  const { name } = Route.useParams()
  const navigate = useNavigate()

  const [address, setAddress] = useState<Address | null>(null)

  const { data: walletClient } = useWalletClient()

  const handleSyncComplete = useCallback(() => {
    navigate({ to: '/$name/roles', params: { name } })
  }, [navigate, name])

  const {
    grantRoles,
    isWriting,
    isSyncing,
    error,
    reset: resetError,
  } = useGrantRoles({ onSyncComplete: handleSyncComplete })

  if (!walletClient?.account) return <div>Not connected.</div>

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!e.currentTarget.reportValidity()) return

    const fd = new FormData(e.currentTarget)
    const roles: Role[] = []

    for (const [k, v] of fd.entries()) {
      if (v === 'on') {
        roles.push(k as Role)
      }
    }

    if (address && roles.length > 0) {
      resetError()
      grantRoles({ name, account: address, roles })
    }
  }

  const isBusy = isWriting || isSyncing

  return (
    <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
      <Link to="/$name/roles" params={{ name }}>
        <Button variant="ghost" className="flex items-center gap-2 -ml-2">
          <ArrowLeftIcon className="size-4" />
          Back
        </Button>
      </Link>

      <h1 className="text-[28px] font-medium leading-none">Add user</h1>

      <h2 className="text-lg font-medium">User</h2>
      <div className="flex flex-col gap-6">
        <Field data-invalid={!address}>
          <Input
            id="user"
            name="user"
            placeholder="ens.eth"
            required
            onChange={async (e) => {
              if (e.currentTarget.checkValidity()) {
                const nameOrAddress = e.currentTarget.value as Address

                if (isAddress(nameOrAddress)) {
                  setAddress(nameOrAddress)
                } else {
                  const resolved = await getEnsAddress(client, {
                    name: nameOrAddress,
                    universalResolverAddress:
                      '0x50168842c0f5c9992a34085d9a6dc5b0a4f306ce',
                  })
                  setAddress(resolved)
                }
              }
            }}
            pattern="(?:[\u002DA-Za-z0-9]+[.]eth|0x[a-fA-F0-9]{40})"
          />
        </Field>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">Roles</h2>
          <div className="border rounded-lg divide-y">
            {permissions.map((permission) => {
              // later will change it to allow for owner of eth registry to change those
              const disabledRole =
                permission.key === 'ROLE_REGISTRAR' ||
                permission.key === 'ROLE_RENEW' ||
                permission.key === 'ROLE_SET_TOKEN_OBSERVER' ||
                permission.key === 'ROLE_BURN'

              return (
                <div
                  key={permission.key}
                  className={cn(
                    'flex items-center justify-between p-4 gap-4',
                    disabledRole && 'text-gray-500',
                  )}
                >
                  <div className="flex flex-col gap-1 flex-1">
                    <div className="font-medium">{permission.title}</div>
                    <div className="text-sm text-gray-600">
                      {permission.description}
                    </div>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        name={permission.key}
                        id={permission.key}
                        disabled={disabledRole}
                      />
                      <Label
                        htmlFor={permission.key}
                        className="font-normal cursor-pointer text-gray-600"
                      >
                        Manager
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        name={`${permission.key}_ADMIN`}
                        id={`${permission.key}_ADMIN`}
                        disabled={true}
                      />
                      <Label
                        htmlFor={`${permission.key}_ADMIN`}
                        className="font-normal cursor-pointer text-gray-600"
                      >
                        Admin
                      </Label>
                    </div>
                  </div>
                </div>
              )
            })}
            <div className="flex items-center justify-between p-4 gap-4 text-gray-500">
              <div className="flex flex-col gap-1 flex-1">
                <div className="font-medium">Can transfer admin</div>
                <div className="text-sm text-gray-600">
                  Administrator role to transfer a name
                </div>
              </div>
              <div className="flex items-center gap-8">
                <div className="flex items-center gap-2">
                  <Checkbox
                    name="ROLE_CAN_TRANSFER_ADMIN"
                    id="ROLE_CAN_TRANSFER_ADMIN"
                    disabled
                  />
                  <Label
                    htmlFor="ROLE_CAN_TRANSFER_ADMIN"
                    className="font-normal cursor-pointer text-gray-600"
                  >
                    Admin
                  </Label>
                </div>
              </div>
            </div>
          </div>
          <Button type="submit" className="w-fit" disabled={!address || isBusy}>
            {isSyncing ? 'Syncing...' : isWriting ? 'Saving...' : 'Save roles'}
          </Button>
          {error && (
            <ErrorMessage description={error.message} title={error.name} />
          )}
        </form>
      </div>
    </div>
  )
}
