import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
import { usePublicClient, useWalletClient } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { grantRoles } from '@/features/roles/helpers/grantRoles'
import { useResolvedRoleAccountAddress } from '@/features/roles/hooks/useResolvedRoleAccountAddress'
import { isManagerRoleSettable, permissions } from '@/lib/roles/permissions'
import { cn } from '@/lib/utils'
import { namechainSepolia, wagmiConfig } from '@/lib/wagmi'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'

export const Route = createFileRoute('/$name/roles/add-user')({
  component: RouteComponent,
})

const client = wagmiConfig.getClient({ chainId: namechainSepolia.id })

function RouteComponent() {
  const { name } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [nameOrAddressInput, setNameOrAddressInput] = useState('')

  const chainId = namechainSepolia.id
  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })
  const { data: address } = useResolvedRoleAccountAddress({
    client,
    nameOrAddress: nameOrAddressInput,
  })

  const mutation = useMutation({
    mutationFn: (params: { account: Address; roles: Role[] }) => {
      if (!walletClient?.account || !publicClient) {
        throw new Error('Wallet not connected')
      }

      return grantRoles({
        name,
        account: params.account,
        roles: params.roles,
        walletClient,
        publicClient,
        signer: createEOASigner(walletClient),
        chainId,
      })
    },
    onSuccess: async () => {
      await pollForIndexerSync({
        invalidateQueries: () =>
          queryClient.invalidateQueries({
            predicate: (query) =>
              query.queryKey[0] === 'get-name-roles-accounts',
            refetchType: 'all',
          }),
      })
      navigate({ to: '/$name/roles', params: { name } })
    },
  })

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
      mutation.reset()
      mutation.mutate({ account: address, roles })
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
      <Link to="/$name/roles" params={{ name }}>
        <Button variant="ghost" className="flex items-center gap-2 -ml-2">
          <ArrowLeftIcon className="size-4" />
          Back
        </Button>
      </Link>

      <h1 className="text-heading font-medium leading-none">Add user</h1>

      <h2 className="text-lg font-medium">User</h2>
      <div className="flex flex-col gap-6">
        <Field data-invalid={!address}>
          <Input
            id="user"
            name="user"
            placeholder="ens.eth"
            required
            onChange={(e) => {
              const nameOrAddress = e.currentTarget.value.trim()

              if (!e.currentTarget.checkValidity()) {
                setNameOrAddressInput('')
                return
              }

              setNameOrAddressInput(nameOrAddress)
            }}
            pattern="(?:[\u002DA-Za-z0-9]+[.]eth|0x[a-fA-F0-9]{40})"
          />
        </Field>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">Roles</h2>
          <div className="border rounded-lg divide-y">
            {permissions.map((permission) => {
              const isManagerRoleDisabled = !isManagerRoleSettable(
                permission.key,
              )

              return (
                <div
                  key={permission.key}
                  className={cn(
                    'flex items-center justify-between p-4 gap-4',
                    isManagerRoleDisabled && 'text-quartz-500',
                  )}
                >
                  <div className="flex flex-col gap-1 flex-1">
                    <div className="font-medium">{permission.title}</div>
                    <div className="text-sm text-quartz-500">
                      {permission.description}
                    </div>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        name={permission.key}
                        id={permission.key}
                        disabled={isManagerRoleDisabled}
                      />
                      <Label
                        htmlFor={permission.key}
                        className="font-normal cursor-pointer text-quartz-500"
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
                        className="font-normal cursor-pointer text-quartz-500"
                      >
                        Admin
                      </Label>
                    </div>
                  </div>
                </div>
              )
            })}
            <div className="flex items-center justify-between p-4 gap-4 text-quartz-500">
              <div className="flex flex-col gap-1 flex-1">
                <div className="font-medium">Can transfer admin</div>
                <div className="text-sm text-quartz-500">
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
                    className="font-normal cursor-pointer text-quartz-500"
                  >
                    Admin
                  </Label>
                </div>
              </div>
            </div>
          </div>
          <Button
            type="submit"
            variant="secondary"
            className="w-fit"
            disabled={!address || mutation.isPending}
          >
            {mutation.isPending ? 'Saving...' : 'Save roles'}
          </Button>
          {mutation.error && (
            <ErrorMessage
              description={mutation.error.message}
              title={mutation.error.name}
            />
          )}
        </form>
      </div>
    </div>
  )
}
