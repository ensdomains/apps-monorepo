import { useQuery } from '@tanstack/react-query'
import { resolveAddressOrName } from '@/features/roles/helpers/addUser.handlers'

type UseResolvedRoleAccountAddressParams = {
  client: Parameters<typeof resolveAddressOrName>[0]['client']
  nameOrAddress: string
  enabled?: boolean
}

export const useResolvedRoleAccountAddress = ({
  client,
  nameOrAddress,
  enabled = true,
}: UseResolvedRoleAccountAddressParams) =>
  useQuery({
    queryKey: ['resolve-role-account-address', nameOrAddress] as const,
    queryFn: () => resolveAddressOrName({ client, nameOrAddress }),
    enabled: enabled && !!nameOrAddress,
    retry: false,
  })
