import { Link } from '@tanstack/react-router'
import { NamechainSVG } from '@/assets/chains'
import { Label } from '@/components/ui/label'

export const TokenLocation = ({ name }: { name: string }) => {
  return (
    <Link
      to="/$name/resolver"
      params={{ name }}
      className="w-full p-6 border border-gray-300 rounded-xl hover:bg-gray-100 duration-150 xl:col-span-3"
    >
      <div className="flex flex-row justify-between items-center">
        <div>
          <h3 className="font-medium text-2xl">Mainnet</h3>
          <Label>Token location</Label>
        </div>
        <NamechainSVG height={40} width={40} />
      </div>
    </Link>
  )
}
