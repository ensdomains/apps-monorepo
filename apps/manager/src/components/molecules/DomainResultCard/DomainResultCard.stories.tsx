import type { Meta, StoryObj } from '@storybook/react-vite'
import { DomainResultCard } from './DomainResultCard'

const meta = {
  title: 'Molecules/DomainResultCard',
  component: DomainResultCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    status: {
      control: 'select',
      options: ['available', 'premium'],
    },
    price: {
      control: 'number',
    },
  },
} satisfies Meta<typeof DomainResultCard>

export default meta
type Story = StoryObj<typeof meta>

export const Available: Story = {
  args: {
    domainName: 'example.eth',
    status: 'available',
    price: 45.2,
  },
}

export const Premium: Story = {
  args: {
    domainName: 'premium.eth',
    status: 'premium',
    price: 245000,
  },
}

export const MultipleCards = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-4">
      <DomainResultCard
        domainName="awesome.eth"
        price={32.5}
        status="available"
      />
      <DomainResultCard
        domainName="super.eth"
        price={125000}
        status="premium"
      />
      <DomainResultCard
        domainName="test123.eth"
        price={12.75}
        status="available"
      />
    </div>
  ),
}

export const DifferentLengths = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-4">
      <DomainResultCard domainName="a.eth" price={2450000} status="premium" />
      <DomainResultCard domainName="ab.eth" price={1225000} status="premium" />
      <DomainResultCard domainName="abc.eth" price={245000} status="premium" />
      <DomainResultCard
        domainName="abcd.eth"
        price={61.25}
        status="available"
      />
      <DomainResultCard
        domainName="verylongdomainname.eth"
        price={12.25}
        status="available"
      />
    </div>
  ),
}

export const PricingVariations = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-4">
      <DomainResultCard
        domainName="cheap.eth"
        price={2.45}
        status="available"
      />
      <DomainResultCard
        domainName="moderate.eth"
        price={122.5}
        status="available"
      />
      <DomainResultCard
        domainName="expensive.eth"
        price={24500}
        status="premium"
      />
    </div>
  ),
}

export const WithoutPricing = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-4">
      <DomainResultCard domainName="noprice.eth" status="available" />
      <DomainResultCard domainName="alsono.eth" status="premium" />
    </div>
  ),
}

export const CustomLabels = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-4">
      <DomainResultCard domainName="custom.eth" price={50} status="available" />
      <DomainResultCard
        domainName="another.eth"
        price={1000}
        priceLabel="one-time"
        status="premium"
      />
    </div>
  ),
}

export const InteractiveExample = {
  render: () => (
    <div className="max-w-xl">
      <h3 className="mb-4 font-semibold text-lg">Domain Search Results</h3>
      <div className="space-y-3">
        <DomainResultCard
          domainName="myproject.eth"
          price={42.5}
          status="available"
        />
      </div>
    </div>
  ),
}
