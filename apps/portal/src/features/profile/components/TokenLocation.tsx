import { Link } from '@tanstack/react-router'
import { NamechainSVG } from '@/assets/chains'
import type { EnsNetworkName } from '@/utils/types'

interface TokenLocationProps {
  name: string
  network: EnsNetworkName
}

export const TokenLocation = ({ name }: TokenLocationProps) => {
  return (
    <Link
      to="/$name/resolver"
      params={{ name }}
      className="w-full p-6 border border-border rounded-xl hover:bg-muted duration-150"
    >
      <div className="flex flex-row gap-6 items-center">
        <NamechainSVG height={40} width={40} />
        <div>
          <span className="font-medium">Network</span>
          <h3>Sepolia</h3>
        </div>
      </div>
    </Link>
  )
}
