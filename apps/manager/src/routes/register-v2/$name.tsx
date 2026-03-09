import { createFileRoute } from '@tanstack/react-router'
import { RegistrationV2Page } from '@/features/register-v2/pages/RegistrationV2Page'

export const Route = createFileRoute('/register-v2/$name')({
  component: RegisterV2Route,
})

function RegisterV2Route() {
  const { name } = Route.useParams()

  return <RegistrationV2Page routeName={name} />
}
