import { Link } from '@tanstack/react-router'
import { NamechainSVG } from '@/assets/chains'

interface TokenLocationProps {
  name: string
  network: 'sepolia' | 'namechainSepolia'
}

export const TokenLocation = ({ name, network }: TokenLocationProps) => {
  return (
    <Link
      to="/$name/resolver"
      params={{ name }}
      className="w-full p-6 border border-gray-300 rounded-xl hover:bg-gray-100 duration-150"
    >
      <div className="flex flex-row gap-6 items-center">
        <NamechainSVG height={40} width={40} />
        <div>
          <span className="font-medium">Network</span>
          <h3>{network === 'namechainSepolia' ? 'Namechain' : 'Sepolia'}</h3>
        </div>
      </div>
    </Link>
  )
}
