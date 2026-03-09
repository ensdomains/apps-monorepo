import type { HttpsUrl } from '@/utils/types'
import { CopyableRecord } from './CopyableRecord'

export type DatapointProps = {
  label: string
  value: string
  info?: string
  href?: HttpsUrl
}

export const Datapoint = ({ label, value, href }: DatapointProps) => (
  <>
    <span className="text-sm sm:text-base font-medium max-w-160">{label}</span>
    <CopyableRecord value={value} href={href} />
  </>
)
