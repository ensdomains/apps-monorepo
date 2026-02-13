import { Link } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'
import { Fragment } from 'react'
import { Button } from '@/components/ui/button'

export const DeployRegistryHeader = ({ name }: { readonly name: string }) => {
  return (
    <Fragment>
      <Link to="/$name/registry" params={{ name }}>
        <Button variant="ghost" className="flex items-center gap-2 -ml-2">
          <ArrowLeftIcon className="size-4" />
          Back
        </Button>
      </Link>
      <h1 className="text-[28px] font-medium leading-none">Deploy registry</h1>
    </Fragment>
  )
}
