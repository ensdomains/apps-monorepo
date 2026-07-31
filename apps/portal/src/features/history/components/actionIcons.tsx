import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeftRight,
  ArrowRightLeft,
  Boxes,
  Circle,
  Clock,
  GitBranch,
  Lock,
  RefreshCw,
  Route,
  Settings2,
  ShieldMinus,
  ShieldPlus,
} from 'lucide-react'
import type { ActionIcon } from '../summarize/summarize.types'

const ICONS: Record<ActionIcon, LucideIcon> = {
  address: Route,
  text: Route,
  records: Route,
  contenthash: Route,
  primary: ArrowRightLeft,
  transfer: ArrowLeftRight,
  subname: GitBranch,
  register: GitBranch,
  renew: RefreshCw,
  resolver: Settings2,
  registry: Boxes,
  grant: ShieldPlus,
  revoke: ShieldMinus,
  migrate: ArrowRightLeft,
  fuses: Lock,
  expiry: Clock,
  default: Circle,
}

export const ActionIconGlyph = ({ icon }: { icon: ActionIcon }) => {
  const Glyph = ICONS[icon]
  return <Glyph className="size-4" aria-hidden />
}
