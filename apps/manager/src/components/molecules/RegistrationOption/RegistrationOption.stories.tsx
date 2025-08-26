import type { Meta, StoryObj } from '@storybook/react-vite'
import { RegistrationOption } from './RegistrationOption'

const meta = {
  title: 'Molecules/RegistrationOption',
  component: RegistrationOption,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    years: {
      control: 'number',
      min: 1,
      max: 10,
    },
    pricePerYear: {
      control: 'number',
      min: 0,
    },
    selected: {
      control: 'boolean',
    },
    disabled: {
      control: 'boolean',
    },
    discount: {
      control: 'number',
      min: 0,
      max: 100,
    },
  },
} satisfies Meta<typeof RegistrationOption>

export default meta
type Story = StoryObj<typeof meta>

export const OneYear: Story = {
  args: {
    years: 1,
    pricePerYear: 45.2,
    selected: false,
    onSelect: (years) => console.log('Selected', years, 'year(s)'),
  },
}

export const TwoYears: Story = {
  args: {
    years: 2,
    pricePerYear: 42.7,
    selected: false,
    onSelect: (years) => console.log('Selected', years, 'year(s)'),
  },
}

export const FiveYears: Story = {
  args: {
    years: 5,
    pricePerYear: 40.0,
    selected: false,
    onSelect: (years) => console.log('Selected', years, 'year(s)'),
  },
}

export const Selected: Story = {
  args: {
    years: 3,
    pricePerYear: 41.87,
    selected: true,
    onSelect: (years) => console.log('Selected', years, 'year(s)'),
  },
}

export const Disabled: Story = {
  args: {
    years: 10,
    pricePerYear: 40.0,
    selected: false,
    disabled: true,
    onSelect: (years) => console.log('Selected', years, 'year(s)'),
  },
}

// @ts-expect-error - TODO: Fix args
export const MultipleOptions: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-3">
      <RegistrationOption
        years={1}
        pricePerYear={45.2}
        selected={false}
        onSelect={(years) => console.log('Selected', years, 'year(s)')}
      />
      <RegistrationOption
        years={2}
        pricePerYear={42.7}
        selected={true}
        onSelect={(years) => console.log('Selected', years, 'year(s)')}
      />
      <RegistrationOption
        years={5}
        pricePerYear={40.0}
        selected={false}
        onSelect={(years) => console.log('Selected', years, 'year(s)')}
      />
    </div>
  ),
}

// @ts-expect-error - TODO: Fix args
export const WithDiscounts: Story = {
  render: () => (
    <div className="max-w-md space-y-4">
      <h3 className="font-semibold text-lg">Choose Registration Period</h3>
      <div className="space-y-2">
        <RegistrationOption
          years={1}
          pricePerYear={50.0}
          selected={false}
          onSelect={(years) => console.log('Selected', years, 'year(s)')}
        />
        <RegistrationOption
          years={2}
          pricePerYear={45.0}
          discount={10}
          selected={false}
          onSelect={(years) => console.log('Selected', years, 'year(s)')}
        />
        <RegistrationOption
          years={5}
          pricePerYear={40.0}
          discount={20}
          selected={true}
          onSelect={(years) => console.log('Selected', years, 'year(s)')}
        />
      </div>
      <p className="text-gray-600 text-sm">
        Longer registrations offer better value and protection
      </p>
    </div>
  ),
}

// @ts-expect-error - TODO: Fix args
export const Interactive: Story = {
  render: () => (
    <div className="max-w-md">
      <h3 className="mb-4 font-semibold text-lg">Registration Duration</h3>
      <div className="space-y-3">
        <RegistrationOption
          years={1}
          pricePerYear={45.2}
          selected={false}
          onSelect={(years) => {
            console.log('Selected', years, 'year(s)')
            alert(`Selected ${years} year registration`)
          }}
        />
        <RegistrationOption
          years={3}
          pricePerYear={41.87}
          selected={false}
          onSelect={(years) => {
            console.log('Selected', years, 'year(s)')
            alert(`Selected ${years} year registration`)
          }}
        />
      </div>
    </div>
  ),
}

// @ts-expect-error - TODO: Fix args
export const CustomPricing: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-3">
      <RegistrationOption
        years={1}
        pricePerYear={12.99}
        selected={false}
        onSelect={(years) => console.log('Budget option', years, 'year(s)')}
      />
      <RegistrationOption
        years={2}
        pricePerYear={12.5}
        selected={false}
        onSelect={(years) => console.log('Standard option', years, 'year(s)')}
      />
      <RegistrationOption
        years={5}
        pricePerYear={12.0}
        selected={true}
        onSelect={(years) => console.log('Premium option', years, 'year(s)')}
      />
    </div>
  ),
}

// @ts-expect-error - TODO: Fix args
export const HighValue: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-3">
      <RegistrationOption
        years={1}
        pricePerYear={1000.0}
        selected={false}
        onSelect={(years) => console.log('Premium domain', years, 'year(s)')}
      />
      <RegistrationOption
        years={2}
        pricePerYear={900.0}
        selected={false}
        onSelect={(years) => console.log('Premium domain', years, 'year(s)')}
      />
      <RegistrationOption
        years={5}
        pricePerYear={900.0}
        selected={false}
        onSelect={(years) => console.log('Premium domain', years, 'year(s)')}
      />
    </div>
  ),
}
