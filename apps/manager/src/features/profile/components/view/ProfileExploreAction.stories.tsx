import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { type MaterialSymbol, MSymbol } from '@/components/ui/material-symbol'
import { cn } from '@/lib/utils'
import {
  actionLabelClassName,
  barEditActionClassName,
  barEditActionSymbolClassName,
  favoriteActionClassName,
  iconActionClassName,
  iconActionIconInnerClassName,
  iconActionInnerClassName,
  iconActionSymbolClassName,
  ownerBarContentClassName,
  ownerBarEditActionsClassName,
  profileBarActionsClassName,
  renewActionClassName,
  renewActionSymbolClassName,
} from './ProfileAction.styles'
import { ProfileExploreAction } from './ProfileExploreAction'

const meta = {
  title: 'Features/Profile/Explore action',
  component: ProfileExploreAction,
  args: { target: { kind: 'name', name: 'nick.eth' } },
} satisfies Meta<typeof ProfileExploreAction>

export default meta
type Story = StoryObj<typeof meta>

const padded: Story['decorators'] = [
  (Story) => (
    <div className="p-10">
      <Story />
    </div>
  ),
]

export const Name: Story = { decorators: padded }

export const Address: Story = {
  args: {
    target: {
      kind: 'address',
      address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    },
  },
  decorators: padded,
}

const IconAction = ({
  className,
  symbol,
}: {
  readonly className?: string
  readonly symbol: MaterialSymbol
}) => (
  <span className={cn(iconActionClassName, className)}>
    <span className={iconActionIconInnerClassName}>
      <MSymbol className={iconActionSymbolClassName} symbol={symbol} />
    </span>
  </span>
)

// The owner's floating bar at its fullest, same classes and width cap as the real one
export const InOwnerBar: Story = {
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-97.5 overflow-hidden bg-white xl:max-w-226.25">
        <div className={ownerBarContentClassName}>
          <div className={profileBarActionsClassName}>
            <IconAction className={favoriteActionClassName} symbol="favorite" />
            <IconAction symbol="ios_share" />
            <Story />
            <span className={renewActionClassName}>
              <span className={iconActionInnerClassName}>
                <span className={actionLabelClassName}>Renew Name</span>
                <MSymbol
                  className={renewActionSymbolClassName}
                  symbol="double_arrow"
                />
              </span>
            </span>
          </div>
          <div className={ownerBarEditActionsClassName}>
            <span
              className={cn(
                barEditActionClassName,
                'inline-flex items-center bg-ens-lapis-core text-white',
              )}
            >
              <MSymbol className={barEditActionSymbolClassName} symbol="edit" />
              <span className={actionLabelClassName}>Edit</span>
            </span>
          </div>
        </div>
      </div>
    ),
  ],
  args: { layout: 'ownerBar' },
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
  },
}
