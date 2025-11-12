import { Link } from '@tanstack/react-router'
import { Calendar, CopyIcon, Wallet } from 'lucide-react'
import placeholderAvatar from '@/assets/placeholder-avatar.svg'
import { Highlight } from '@/components/atoms/Highlight'
import { ImageSelectionDialog } from '@/features/profile/components/dialogs/ImageSelectionDialog'
import { sharedOptions, withForm } from '@/features/profile/components/form'

const copyToClipboard = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value)
    alert('Copied to clipboard')
  } catch {
    // noop
  }
}

export const HeaderSection = withForm({
  ...sharedOptions,
  props: {
    name: '',
  },
  render: ({ form, name }) => (
    <div className="overflow-hidden md:rounded-xl">
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
        <div className="-bottom-10 max-md:-translate-x-1/2 absolute left-1/2 size-24 md:left-6 md:size-36 lg:size-40">
          <div className="size-full overflow-hidden rounded-xl bg-gray-200 shadow-md ring-2 ring-white">
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
      </div>

      {/* Main info */}
      <div className="flex w-full flex-col items-start gap-3 bg-gray-100 px-4 pt-16 pb-4 text-center md:px-6 md:pt-16 md:pb-6 md:text-left">
        <Highlight className="text-lg md:text-2xl">{name}</Highlight>
        <div className="flex items-center gap-x-2 whitespace-pre-wrap">
          <Wallet className="size-5" />
          Owned by <span className="font-medium">{name}</span>
        </div>
        <div className="flex items-center gap-x-2 whitespace-pre-wrap">
          <Calendar className="size-5" />
          Expires <span className="font-medium">August 28, 2027</span>
        </div>
        <div className="flex items-center gap-x-2">
          <Link
            to="/p/$name"
            params={{ name }}
            className="underline underline-offset-2"
          >
            app.ens.domains/p/{name}
          </Link>
          <button
            type="button"
            onClick={() => copyToClipboard(`app.ens.domains/p/${name}`)}
          >
            <CopyIcon className="size-4" />
          </button>
        </div>
      </div>
    </div>
  ),
})
