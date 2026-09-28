import { Link } from '@tanstack/react-router'
import { LogoSVG } from '@/assets/logo'

export const HomeHeader = () => (
  <header>
    <Link to="/" className="flex items-center gap-2.25 text-foreground">
      <LogoSVG width={26} height={29} />
      <span className="text-2xl font-medium">ENS Explorer</span>
    </Link>
  </header>
)
