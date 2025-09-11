import { Link } from '@tanstack/react-router'
import { Calendar, Wallet } from 'lucide-react'
import placeholderAvatar from '@/assets/placeholder-avatar.svg'
import { Highlight } from '@/components/atoms/Highlight'
import { ImageSelectionDialog } from '@/features/profile/components/dialogs/ImageSelectionDialog'
import { sharedOptions, withForm } from '@/features/profile/components/form'

export const HeaderSection = withForm({
  ...sharedOptions,
  props: {
    name: '',
  },
  render: ({ form, name }) => (
    <div>
      {/* Header BG */}
      <div className="relative w-full">
        <form.Field name="base.header">
          {(field) => (
            <ImageSelectionDialog
              currentImage={field.state.value}
              defaultImage=""
              onImageChange={(url) => {
                field.handleChange(url)
              }}
              onImageRemove={() => {
                field.handleChange('')
              }}
              title="Change Header Image"
              description="Choose a header image for your profile"
              type="header"
              name={name}
            />
          )}
        </form.Field>
        <div className="-bottom-6 -translate-x-1/2 absolute left-1/2 size-32">
          <form.Field name="base.avatar">
            {(field) => (
              <ImageSelectionDialog
                currentImage={field.state.value}
                defaultImage={placeholderAvatar}
                onImageChange={(url) => {
                  field.handleChange(url)
                }}
                onImageRemove={() => {
                  field.handleChange('')
                }}
                title="Change Avatar"
                description="Choose an avatar for your profile"
                type="avatar"
                name={name}
              />
            )}
          </form.Field>
        </div>
      </div>

      {/* Main info */}
      <div className="flex w-full flex-col gap-1 bg-gray-100 px-4 pt-8 pb-4">
        <Highlight>{name}</Highlight>
        <div className="flex items-center whitespace-pre-wrap">
          <Wallet className="mr-2 size-5" />
          Owned by <span className="font-medium">{name}</span>
        </div>
        <div className="flex items-center whitespace-pre-wrap">
          <Calendar className="mr-2 size-5" />
          Expires <span className="font-medium">August 28, 2027</span>
        </div>
        <Link
          to="/p/$name"
          params={{ name }}
          className="underline underline-offset-2"
        >
          app.ens.domains/p/{name}
        </Link>
      </div>
    </div>
  ),
})
