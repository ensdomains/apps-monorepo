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
      options: ['available', 'premium', 'unavailable'],
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
    onAction: () => alert('Registering example.eth'),
  },
}

export const Premium: Story = {
  args: {
    domainName: 'premium.eth',
    status: 'premium',
    price: 245000,
    onAction: () => alert('Registering premium.eth'),
  },
}

export const Unavailable: Story = {
  args: {
    domainName: 'taken.eth',
    status: 'unavailable',
  },
}

// @ts-expect-error - TODO: Fix args
export const MultipleCards: Story = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-4">
      <DomainResultCard
        domainName="awesome.eth"
        status="available"
        price={32.5}
        onAction={() => alert('Registering awesome.eth')}
      />
      <DomainResultCard
        domainName="super.eth"
        status="premium"
        price={125000}
        onAction={() => alert('Registering super.eth')}
      />
      <DomainResultCard domainName="common.eth" status="unavailable" />
      <DomainResultCard
        domainName="test123.eth"
        status="available"
        price={12.75}
        onAction={() => alert('Registering test123.eth')}
      />
    </div>
  ),
}

// @ts-expect-error - TODO: Fix args
export const DifferentLengths: Story = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-4">
      <DomainResultCard
        domainName="a.eth"
        status="premium"
        price={2450000}
        onAction={() => alert('Registering a.eth')}
      />
      <DomainResultCard
        domainName="ab.eth"
        status="premium"
        price={1225000}
        onAction={() => alert('Registering ab.eth')}
      />
      <DomainResultCard
        domainName="abc.eth"
        status="premium"
        price={245000}
        onAction={() => alert('Registering abc.eth')}
      />
      <DomainResultCard
        domainName="abcd.eth"
        status="available"
        price={61.25}
        onAction={() => alert('Registering abcd.eth')}
      />
      <DomainResultCard
        domainName="verylongdomainname.eth"
        status="available"
        price={12.25}
        onAction={() => alert('Registering verylongdomainname.eth')}
      />
    </div>
  ),
}

// @ts-expect-error - TODO: Fix args
export const PricingVariations: Story = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-4">
      <DomainResultCard
        domainName="cheap.eth"
        status="available"
        price={2.45}
        onAction={() => alert('Registering cheap.eth')}
      />
      <DomainResultCard
        domainName="moderate.eth"
        status="available"
        price={122.5}
        onAction={() => alert('Registering moderate.eth')}
      />
      <DomainResultCard
        domainName="expensive.eth"
        status="premium"
        price={24500}
        onAction={() => alert('Registering expensive.eth')}
      />
    </div>
  ),
}

// @ts-expect-error - TODO: Fix args
export const WithoutPricing: Story = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-4">
      <DomainResultCard
        domainName="noprice.eth"
        status="available"
        onAction={() => alert('Registering noprice.eth')}
      />
      <DomainResultCard
        domainName="alsono.eth"
        status="premium"
        onAction={() => alert('Registering alsono.eth')}
      />
    </div>
  ),
}

// @ts-expect-error - TODO: Fix args
export const CustomLabels: Story = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-4">
      <DomainResultCard
        domainName="custom.eth"
        status="available"
        price={50}
        priceLabel="per year"
        // actionText="Buy Now"
        onAction={() => alert('Custom action!')}
      />
      <DomainResultCard
        domainName="another.eth"
        status="premium"
        price={1000}
        priceLabel="one-time"
        // actionText="Learn More"
        onAction={() => alert('Learning more...')}
      />
    </div>
  ),
}

// @ts-expect-error - TODO: Fix args
export const InteractiveExample: Story = {
  render: () => (
    <div className="max-w-xl">
      <h3 className="mb-4 font-semibold text-lg">Domain Search Results</h3>
      <div className="space-y-3">
        <DomainResultCard
          domainName="myproject.eth"
          status="available"
          price={42.5}
          onAction={(domainName) => {
            console.log('Registering', domainName)
            alert(`Registration process would start for ${domainName}!`)
          }}
        />
      </div>
    </div>
  ),
}
