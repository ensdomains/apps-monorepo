import { createFileRoute, useParams } from '@tanstack/react-router'

export const Route = createFileRoute('/$name/ownership')({
  component: RouteComponent,
})

const OwnerInfo = ({ name }: { name: string }) => {
  return <div>{name}</div>
}

function RouteComponent() {
  const { name } = useParams({ from: '/$name/ownership' })
  return (
    <div className="max-w-5xl w-full mx-auto flex flex-col gap-6 m-6">
      <div className="flex flex-row justify-between">
        <h1 className="font-medium text-[28px]">Ownership</h1>
        <a
          href="#change"
          className="bg-secondary text-secondary-foreground px-4 py-2 rounded-sm text-base font-medium"
        >
          Transfer ownership
        </a>
      </div>
      <div>
        <OwnerInfo name={name} />
      </div>
    </div>
  )
}
