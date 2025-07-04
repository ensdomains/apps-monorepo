import type { Meta, StoryObj } from '@storybook/react-vite'
import { SearchForm } from './SearchForm'

const meta = {
  title: 'Organisms/SearchForm',
  component: SearchForm,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    loading: {
      control: 'boolean',
    },
    showRecentSearches: {
      control: 'boolean',
    },
  },
} satisfies Meta<typeof SearchForm>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    onSearch: (query) => console.log('Searching for:', query),
  },
}

export const WithPlaceholder: Story = {
  args: {
    placeholder: 'Search for ENS domains...',
    onSearch: (query) => console.log('Searching for:', query),
  },
}

export const Loading: Story = {
  args: {
    loading: true,
    onSearch: (query) => console.log('Searching for:', query),
  },
}

export const WithRecentSearches: Story = {
  args: {
    recentSearches: ['example.eth', 'test.eth', 'myname.eth'],
    onSearch: (query) => console.log('Searching for:', query),
    onRecentSearchSelect: (query: string) =>
      console.log('Selected recent search:', query),
  },
}

export const Interactive: Story = {
  render: () => (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold mb-6">Find Your Perfect Domain</h2>
      <SearchForm
        placeholder="Enter your desired domain name"
        onSearch={(query) => {
          console.log('Searching for:', query)
          alert(`Starting search for: ${query}`)
        }}
      />
      <p className="text-sm text-muted-foreground mt-4">
        Search for .eth domains to check availability and pricing
      </p>
    </div>
  ),
}

export const FullFeatured: Story = {
  render: () => (
    <div className="max-w-2xl">
      <SearchForm
        placeholder="Search domains..."
        recentSearches={['alice.eth', 'bob.eth', 'crypto.eth', 'web3.eth']}
        loading={false}
        onSearch={(query) => {
          console.log('Full search for:', query)
          setTimeout(() => {
            console.log('Search completed for:', query)
          }, 2000)
        }}
        onRecentSearchSelect={(query: string) => {
          console.log('Using recent search:', query)
        }}
      />
    </div>
  ),
}

export const MobileView: Story = {
  render: () => (
    <div className="max-w-sm">
      <SearchForm
        placeholder="Search..."
        onSearch={(query) => console.log('Mobile search:', query)}
      />
    </div>
  ),
}

export const WithoutRecentSearches: Story = {
  args: {
    placeholder: 'Find domains...',
    showRecentSearches: false,
    onSearch: (query) => console.log('No recent searches:', query),
  },
}

export const RealWorldExample: Story = {
  render: () => (
    <div className="w-full max-w-4xl mx-auto py-12">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-4">
          Your Web3 Identity Starts Here
        </h1>
        <p className="text-xl text-muted-foreground mb-8">
          Search for the perfect .eth domain name
        </p>
      </div>

      <SearchForm
        placeholder="Enter your dream domain name"
        recentSearches={['vitalik.eth', 'ethereum.eth', 'defi.eth']}
        onSearch={(query) => {
          console.log('Real world search:', query)
        }}
        onRecentSearchSelect={(query: string) => {
          console.log('Recent search selected:', query)
        }}
      />

      <div className="text-center mt-6">
        <p className="text-sm text-muted-foreground">
          Popular searches: • blockchain.eth • nft.eth • dao.eth
        </p>
      </div>
    </div>
  ),
}
