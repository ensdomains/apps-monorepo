import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'
import { type FormEvent, type MouseEventHandler, useState } from 'react'
import { isAddress } from 'viem'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { permissions } from '@/lib/roles/permissions'

export const Route = createFileRoute('/$name/roles/add-user')({
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = Route.useParams()

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (e.currentTarget.reportValidity()) {
      const fd = new FormData(e.currentTarget)

      // Here you would handle the form submission
      console.log(fd)
      // TODO: Implement actual submission logic
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
      <Link to="/$name/roles" params={{ name }}>
        <Button variant="ghost" className="flex items-center gap-2 -ml-2">
          <ArrowLeftIcon className="size-4" />
          Back
        </Button>
      </Link>

      <h1 className="text-[28px] font-medium leading-none">Add user</h1>

      <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="user">User</Label>
          <Input
            id="user"
            name="user"
            placeholder="ENS name or HEX address"
            required
            pattern="(?:[\u002DA-Za-z0-9]+[.]eth|0x[a-fA-F0-9]{40})"
          />
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">Roles</h2>
          <div className="border rounded-lg divide-y">
            {permissions.map((permission) => (
              <div
                key={permission.key}
                className="flex items-center justify-between p-4 gap-4"
              >
                <div className="flex flex-col gap-1 flex-1">
                  <div className="font-medium">{permission.title}</div>
                  <div className="text-sm text-gray-600">
                    {permission.description}
                  </div>
                </div>
                <div className="flex items-center gap-8">
                  <div className="flex items-center gap-2">
                    <Checkbox name={permission.key} id={permission.key} />
                    <Label
                      htmlFor={permission.key}
                      className="font-normal cursor-pointer text-gray-600"
                    >
                      Manager
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      name={`${permission.key}_ADMIN`}
                      id={`${permission.key}_ADMIN`}
                    />
                    <Label
                      htmlFor={`${permission.key}_ADMIN`}
                      className="font-normal cursor-pointer text-gray-600"
                    >
                      Admin
                    </Label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Button type="submit" className="w-fit">
          Save roles
        </Button>
      </form>
    </div>
  )
}
