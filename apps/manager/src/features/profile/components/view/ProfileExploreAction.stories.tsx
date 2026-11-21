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
  primaryActionClassName,
  profileBarActionsClassName,
  renewActionClassName,
} from './ProfileAction.styles'
import { ProfileExploreAction } from './ProfileExploreAction'

const meta = {
  title: 'Features/Profile/Explore action',
  component: ProfileExploreAction,
  args: { name: 'nick.eth' },
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
                <span className={cn(actionLabelClassName, 'xl:hidden')}>
                  Renew
                </span>
                <span className={cn(actionLabelClassName, 'hidden xl:inline')}>
                  Renew Name
                </span>
              </span>
            </span>
          </div>
          <div className={ownerBarEditActionsClassName}>
            <span
              className={cn(
                barEditActionClassName,
                primaryActionClassName,
                'inline-flex items-center',
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
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
  },
}
