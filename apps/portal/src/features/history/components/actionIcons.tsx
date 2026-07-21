import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeftRight,
  ArrowRightLeft,
  Boxes,
  Circle,
  Clock,
  Eye,
  FileCode2,
  Flame,
  GitBranch,
  List,
  Lock,
  RefreshCw,
  Settings2,
  ShieldMinus,
  ShieldPlus,
  Sparkles,
  Star,
  Type,
  Wallet,
} from 'lucide-react'
import type { ActionIcon } from '../summarize/summarize.types'

const ICONS: Record<ActionIcon, LucideIcon> = {
  address: Wallet,
  text: Type,
  records: List,
  contenthash: FileCode2,
  primary: Star,
  transfer: ArrowLeftRight,
  subname: GitBranch,
  register: Sparkles,
  renew: RefreshCw,
  resolver: Settings2,
  registry: Boxes,
  grant: ShieldPlus,
  revoke: ShieldMinus,
  migrate: ArrowRightLeft,
  fuses: Lock,
  expiry: Clock,
  burn: Flame,
  observer: Eye,
  default: Circle,
}

export const ActionIconGlyph = ({ icon }: { icon: ActionIcon }) => {
  const Glyph = ICONS[icon] ?? Circle
  return <Glyph className="size-4" aria-hidden />
}
