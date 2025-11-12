import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useParams } from '@tanstack/react-router'
import type { Address } from 'viem'
import { NoRegistryCard } from '@/features/registry/components/NoRegistryCard'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistries'

export const Route = createFileRoute('/$name/registry')({
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = useParams({ from: '/$name/registry' })

  const { data, isLoading, error } = useQuery(
    getNameRegistriesQueryOptions({ name }),
  )

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
        <h1 className="text-[28px] font-medium leading-[1]">Registry</h1>
        <div>Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
        <h1 className="text-[28px] font-medium leading-[1]">Registry</h1>
        <div>Error: {error.message}</div>
      </div>
    )
  }

  if (!data || !Array.isArray(data)) {
    return (
      <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
        <h1 className="text-[28px] font-medium leading-[1]">Registry</h1>
        <div>No data</div>
      </div>
    )
  }

  // Drop the root registry (last element)
  const allRegistries = data as readonly Address[]
  const registriesWithoutRoot = allRegistries.slice(0, -1)

  // Check if this name has a registry (first element after removing root)
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address
  const thisNameRegistry = registriesWithoutRoot[0]
  const hasOwnRegistry = thisNameRegistry && thisNameRegistry !== ZERO_ADDRESS

  // Parent registries are all the others (excluding the name's own registry if it has one)
  const parentRegistries = hasOwnRegistry
    ? registriesWithoutRoot.slice(1)
    : registriesWithoutRoot.slice(1)

  return (
    <div className="flex flex-col gap-6 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
      <h1 className="text-[28px] font-medium leading-[1]">Registry</h1>

      {!hasOwnRegistry ? (
        <NoRegistryCard />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="p-4 border border-gray-300 rounded-lg">
            <h2 className="font-semibold mb-2">This name's registry</h2>
            <p className="text-sm text-gray-600">Address: {thisNameRegistry}</p>
            <p className="text-sm text-gray-600 mt-2">
              TODO: Fetch owner, verification status, and other details
            </p>
          </div>

          {parentRegistries.length > 0 && (
            <div className="mt-4">
              <h2 className="text-xl font-semibold mb-2">Parent registries</h2>
              {parentRegistries.map((registry: Address, idx: number) => (
                <div
                  key={registry}
                  className="p-4 border border-gray-300 rounded-lg mb-2"
                >
                  <p className="text-sm text-gray-600">
                    Parent {idx + 1}: {registry}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
