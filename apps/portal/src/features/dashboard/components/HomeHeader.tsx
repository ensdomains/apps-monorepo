import { LogoWithTextSVG } from '@/assets/logo'
import { Badge } from '@/components/ui/badge'
import { WalletMenu } from '@/components/WalletMenu'

export const HomeHeader = () => (
  <header className="flex gap-6 items-center justify-center">
    <LogoWithTextSVG width={97} height={30} className="text-foreground" />
    <div className="inline-grid place-items-start">
      <Badge
        variant="accent"
        className="col-start-1 row-start-1 self-start ml-33.75 z-10"
      >
        Alpha
      </Badge>
      <span className="col-start-1 row-start-1 text-4xl font-medium text-foreground leading-none">
        Explorer
      </span>
    </div>
    <WalletMenu />
  </header>
)
