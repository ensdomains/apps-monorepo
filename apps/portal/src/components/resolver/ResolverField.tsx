import { CopyableRecord } from '../molecules/CopyableRecord'

export const ResolverField = ({
  label,
  value,
}: {
  label: string
  value: string | number
}) => (
  <div className="flex flex-col gap-1 w-full">
    <span className="font-sans font-normal text-sm text-gray-500">{label}</span>
    <CopyableRecord value={value} />
  </div>
)

export const CCIPGatewayURLView = () => {
  return <ResolverField label="CCIP gateway URLs" value="lol" />
}
