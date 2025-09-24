import { Link } from '@tanstack/react-router'
import { NamechainSVG } from '@/assets/chains'
import { Label } from '@/components/ui/label'

export const ResolverLocation = ({ name }: { name: string }) => {
  return (
    <Link
      to="/$name/resolver"
      params={{ name }}
      className="w-full p-6 hover:bg-gray-100 duration-150"
    >
      <div className="flex flex-row justify-between items-center">
        <div>
          <h3 className="font-medium text-2xl">Mainnet</h3>
          <Label>Resolver location</Label>
        </div>
        <NamechainSVG height={40} width={40} />
      </div>
    </Link>
  )
}
