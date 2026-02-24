import { Network } from 'lucide-react'

type NetworkCardProps = {
  label: string
}

export function LabelCard({ label }: NetworkCardProps) {
  return (
    <div className="p-6 flex flex-row rounded-2xl gap-6 items-center border border-border">
      <div className="bg-secondary text-secondary-foreground rounded-full p-3">
        <Network />
      </div>
      <div className="flex flex-col">
        <span className="font-medium">Label</span>
        <span>{label}</span>
      </div>
    </div>
  )
}
