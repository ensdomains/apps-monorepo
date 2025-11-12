import { Info } from 'lucide-react'

export function NoRegistryCard() {
  return (
    <div className="border border-gray-300 rounded-lg p-6 bg-gray-50">
      <div className="flex items-start gap-3">
        <Info className="size-5 text-gray-600 mt-0.5" />
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">
            This name does not have a registry. You must deploy one to create
            subnames.
          </p>
        </div>
      </div>
    </div>
  )
}
