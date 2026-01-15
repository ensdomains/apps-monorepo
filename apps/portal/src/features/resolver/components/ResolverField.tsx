import type { Address } from 'viem'
import { CopyableRecord } from '../../../components/CopyableRecord'

export const ResolverField = ({
  label,
  value,
}: {
  label: string
  value: Address
}) => (
  <div className="flex flex-col gap-1 w-full">
    <span className="font-sans font-normal text-sm text-gray-500">{label}</span>
    <CopyableRecord value={value} />
  </div>
)
