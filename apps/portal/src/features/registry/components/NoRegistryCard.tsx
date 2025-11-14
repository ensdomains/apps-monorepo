import { Info } from 'lucide-react'

export function NoRegistryCard() {
  return (
    <div className="bg-gray-100 rounded-lg p-8 flex flex-col items-start gap-4 relative w-full mx-auto my-4">
      <div className="flex items-center gap-3">
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
