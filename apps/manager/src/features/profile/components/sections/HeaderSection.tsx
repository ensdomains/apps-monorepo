import type { Address } from 'viem'
import placeholderAvatar from '@/assets/placeholder-avatar.svg'
import { ProfileHeaderInfo } from '@/features/profile/components/common/ProfileHeaderInfo'
import { ImageSelectionDialog } from '@/features/profile/components/dialogs/ImageSelectionDialog'
import { ShareProfileDialog } from '@/features/profile/components/dialogs/ShareProfileDialog'
import { sharedOptions, withForm } from '@/features/profile/components/form'

interface HeaderSectionProps {
  name: string
  owner?: Address
}

export const HeaderSection = withForm({
  ...sharedOptions,
  props: { name: '', owner: undefined } as HeaderSectionProps,
  render: ({ form, name, owner }) => (
    <div className="overflow-hidden rounded-xl border-[0.25px] border-border bg-white shadow-none">
      {/* Header BG */}
      <div className="relative w-full">
        <form.Field name="base.header">
          {(field) => (
            <ImageSelectionDialog
              currentImage={field.state.value}
              defaultImage=""
              description="Choose a header image for your profile"
              name={name}
              onImageChange={(url) => field.handleChange(url)}
              onImageRemove={() => field.handleChange('')}
              title="Change Header Image"
              type="header"
            />
          )}
        </form.Field>
        {/* Share button overlay */}
        <div className="absolute top-2 right-2">
          <form.Subscribe selector={(state) => state.values.base.avatar}>
            {(avatarUrl) => (
              <ShareProfileDialog
                avatarUrl={avatarUrl}
                name={name}
                url={`${
                  typeof window !== 'undefined'
                    ? window.location.origin
                    : 'https://app.ens.domains'
                }/p/${name}`}
              />
            )}
          </form.Subscribe>
        </div>
        <div className="-bottom-10 max-md:-translate-x-1/2 absolute left-1/2 size-24 md:left-6 md:size-36 lg:size-40">
          <div className="size-full overflow-hidden rounded-xl bg-gray-200 shadow-md ring-2 ring-white">
            <form.Field name="base.avatar">
              {(field) => (
                <ImageSelectionDialog
                  currentImage={field.state.value}
                  defaultImage={placeholderAvatar}
                  description="Choose an avatar for your profile"
                  name={name}
                  onImageChange={(url) => field.handleChange(url)}
                  onImageRemove={() => field.handleChange('')}
                  title="Change Avatar"
                  type="avatar"
                />
              )}
            </form.Field>
          </div>
        </div>
      </div>
      <ProfileHeaderInfo name={name} owner={owner} />
    </div>
  ),
})
