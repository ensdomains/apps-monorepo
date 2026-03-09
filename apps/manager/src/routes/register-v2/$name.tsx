import { createFileRoute, redirect } from '@tanstack/react-router'
import { RegistrationV2Page } from '@/features/register-v2/pages/RegistrationV2Page'
import { normalizeDomainNameFromUrl } from '@/utils/domain'

export const Route = createFileRoute('/register-v2/$name')({
  beforeLoad: ({ params: { name } }) => {
    const normalizedName = normalizeDomainNameFromUrl(name)

    if (normalizedName && normalizedName !== name) {
      throw redirect({
        to: '/register-v2/$name',
        params: { name: normalizedName },
        replace: true,
      })
    }
  },
  component: RegisterV2Route,
})

function RegisterV2Route() {
  const { name } = Route.useParams()

  return <RegistrationV2Page routeName={name} />
}
