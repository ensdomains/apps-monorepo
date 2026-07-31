import type { LucideIcon } from 'lucide-react'
import {
  ArrowRightLeft,
  Circle,
  Clock,
  EyeOff,
  GitBranch,
  Lock,
  RefreshCw,
  Route,
  Sprout,
  UserRoundPlus,
} from 'lucide-react'
import type { ActionIcon } from '../summarize/summarize.types'

const ICONS: Record<ActionIcon, LucideIcon> = {
  address: Route,
  text: Route,
  records: Route,
  contenthash: Route,
  resolver: Route,
  primary: ArrowRightLeft,
  transfer: ArrowRightLeft,
  subname: GitBranch,
  registry: GitBranch,
  register: Sprout,
  renew: RefreshCw,
  grant: UserRoundPlus,
  revoke: EyeOff,
  migrate: ArrowRightLeft,
  fuses: Lock,
  expiry: Clock,
  default: Circle,
}

export const ActionIconGlyph = ({ icon }: { icon: ActionIcon }) => {
  const Glyph = ICONS[icon]
  return <Glyph className="size-4 text-neutral-5" aria-hidden />
}
