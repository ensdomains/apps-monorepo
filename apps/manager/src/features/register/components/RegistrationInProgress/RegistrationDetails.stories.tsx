import type { Meta, StoryObj } from '@storybook/react-vite'
import { RegistrationDetails } from './RegistrationDetails'

const meta = {
  title: 'Features/Register/RegistrationDetails',
  component: RegistrationDetails,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
        <Story />
      </div>
    ),
  ],
  args: {
    domainName: 'example.eth',
    duration: 5,
    totalPrice: 2700,
    discountAmount: 500,
    expiresDate: new Date('2030-11-22'),
    onGoToDashboard: () => {
      console.log('Go to Dashboard clicked')
    },
    onCreateProfile: () => {
      console.log('Create Profile clicked')
    },
  },
} satisfies Meta<typeof RegistrationDetails>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    isRegistrationComplete: false,
  },
}

export const RegistrationComplete: Story = {
  args: {
    isRegistrationComplete: true,
  },
}

export const SingleYear: Story = {
  args: {
    duration: 1,
    totalPrice: 640,
    discountAmount: 0,
    expiresDate: new Date('2026-11-22'),
    isRegistrationComplete: true,
  },
}

export const LongDuration: Story = {
  args: {
    domainName: 'verylongdomainname.eth',
    duration: 10,
    totalPrice: 5400,
    discountAmount: 1000,
    expiresDate: new Date('2035-11-22'),
    isRegistrationComplete: true,
  },
}

export const HighPrice: Story = {
  args: {
    domainName: 'premium.eth',
    duration: 3,
    totalPrice: 50000,
    discountAmount: 10000,
    expiresDate: new Date('2028-11-22'),
    isRegistrationComplete: true,
  },
}
