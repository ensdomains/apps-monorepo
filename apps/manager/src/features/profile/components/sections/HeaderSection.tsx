import placeholderAvatar from '@/assets/placeholder-avatar.svg'
import { ProfileHeaderInfo } from '@/features/profile/components/common/ProfileHeaderInfo'
import { ImageSelectionDialog } from '@/features/profile/components/dialogs/ImageSelectionDialog'
import { sharedOptions, withForm } from '@/features/profile/components/form'

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
      <ProfileHeaderInfo name={name} />
    </div>
  ),
})
