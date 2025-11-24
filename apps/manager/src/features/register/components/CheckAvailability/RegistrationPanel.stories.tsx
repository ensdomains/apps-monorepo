import type { Meta, StoryObj } from '@storybook/react-vite'
import { RegistrationPanel } from './RegistrationPanel'

const meta = {
  title: 'Features/Register/CheckAvailability/RegistrationPanel',
  component: RegistrationPanel,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="flex min-h-screen items-center justify-center bg-slate-900/10 p-12">
        <div className="w-full max-w-4xl">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    isOpen: true,
    result: {
      name: 'fli.eth',
      isAvailable: true,
      isPremium: true,
    },
    onClose: () => {},
    isProcessing: false,
    isPricingLoading: false,
    error: null,
    registrationSuccess: false,
  },
} satisfies Meta<typeof RegistrationPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Processing: Story = {
  args: {
    isProcessing: true,
  },
}

export const WithError: Story = {
  args: {
    error: 'Registration failed. Please try again.',
  },
}

export const Success: Story = {
  args: {
    registrationSuccess: true,
  },
}

export const Unavailable: Story = {
  args: {
    result: {
      name: 'vitalik.eth',
      isAvailable: false,
      isPremium: false,
    },
  },
}
