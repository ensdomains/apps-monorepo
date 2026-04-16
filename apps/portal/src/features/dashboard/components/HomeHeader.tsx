import { Link } from '@tanstack/react-router'
import { LogoSVG, LogoWithTextSVG } from '@/assets/logo'
import { Badge } from '@/components/ui/badge'
import { WalletMenu } from '@/components/WalletMenu'

export const HomeHeader = () => (
  <header className="flex flex-col sm:flex-row gap-5 sm:gap-6 sm:items-center sm:justify-center w-full sm:w-auto">
    {/* Mobile: logo mark + connect as a justify-between row.
        Desktop: sm:contents spreads children into parent flex row. */}
    <div className="flex items-center justify-between sm:contents">
      <Link
        to="/"
        className="flex items-center group-data-[collapsible=icon]:hidden sm:order-1"
      >
        <LogoSVG width={35} height={40} className="sm:hidden text-foreground" />
        <LogoWithTextSVG
          width={97}
          height={30}
          className="hidden sm:block text-foreground"
        />
      </Link>
      <div className="sm:order-3">
        <WalletMenu />
      </div>
    </div>

    {/* Explorer + Alpha badge */}
    <div className="sm:order-2 self-center inline-grid place-items-start">
      <Badge
        variant="accent"
        className="col-start-1 row-start-1 self-start ml-33.75 z-10"
      >
        Alpha
      </Badge>
      <span className="col-start-1 row-start-1 text-4xl font-normal text-foreground leading-none">
        Explorer
      </span>
    </div>
  </header>
)
