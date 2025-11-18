import type { Meta, StoryObj } from '@storybook/react-vite'
import { CheckAvailabilityView } from './CheckAvailabilityView'

const pricing = {
  1: { price: 640, discount: 0, label: '1 year' },
  2: { price: 540, discount: 15, label: '2 years' },
  3: { price: 540, discount: 40, label: '3 years', badge: 'best' as const },
  4: { price: 540, discount: 45, label: '4 years' },
  5: { price: 540, discount: 50, label: '5 years+' },
}

const meta = {
  title: 'Features/Register/CheckAvailability/CheckAvailability',
  component: CheckAvailabilityView,
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
    inputValue: '',
    isSearching: false,
    isProcessing: false,
    onInputChange: () => {},
    onSearch: () => {},
  },
} satisfies Meta<typeof CheckAvailabilityView>

export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = {}

export const ErrorState: Story = {
  args: {
    inputValue: 'oops.eth',
    errorMessage: 'Request throttled',
  },
}

export const RegistrationPanelOpenUnavailable: Story = {
  args: {
    inputValue: 'erni.eth',
    panelProps: {
      isOpen: true,
      result: {
        name: 'erni.eth',
        isAvailable: false,
        isPremium: true,
      },
      pricing,
      selectedDuration: 2,
      onSelectDuration: () => {},
      onClose: () => {},
      onConfirm: () => {},
      isProcessing: false,
      error: null,
      registrationSuccess: false,
    },
  },
}

export const RegistrationPanelSuccess: Story = {
  args: {
    inputValue: 'erni.eth',
    panelProps: {
      isOpen: true,
      result: {
        name: 'erni.eth',
        isAvailable: true,
        isPremium: true,
      },
      pricing,
      selectedDuration: 2,
      onSelectDuration: () => {},
      onClose: () => {},
      onConfirm: () => {},
      isProcessing: false,
      error: null,
      registrationSuccess: true,
    },
  },
}

export const PagePreview: Story = {
  name: 'Full Page Preview',
  parameters: {
    layout: 'fullscreen',
  },
  render: (_, { args }) => (
    <div className="relative min-h-screen overflow-hidden bg-slate-100">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-100 via-white to-slate-200" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-16">
        <div className="w-full max-w-4xl">
          <CheckAvailabilityView
            {...RegistrationPanelOpenUnavailable.args}
            {...args}
          />
        </div>
      </div>
    </div>
  ),
}
