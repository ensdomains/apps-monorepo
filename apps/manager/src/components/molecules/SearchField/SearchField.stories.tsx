import type { Meta, StoryObj } from '@storybook/react-vite'
import { SearchField } from './SearchField'

const meta = {
  title: 'Molecules/SearchField',
  component: SearchField,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    // size: {
    //   control: 'select',
    //   options: ['sm', 'default', 'lg'],
    // },
    disabled: {
      control: 'boolean',
    },
    // showSearchIcon: {
    //   control: 'boolean',
    // },
  },
} satisfies Meta<typeof SearchField>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    placeholder: 'Search for domains...',
    onSearch: (query) => console.log('Searching for:', query),
  },
}

export const WithValue: Story = {
  args: {
    placeholder: 'Search for domains...',
    defaultValue: 'example',
    onSearch: (query) => console.log('Searching for:', query),
  },
}

export const WithoutIcon: Story = {
  args: {
    placeholder: 'Search for domains...',
    // showSearchIcon: false,
    onSearch: (query) => console.log('Searching for:', query),
  },
}

export const CustomSearchIcon: Story = {
  args: {
    placeholder: 'Search for domains...',
    // searchIconElement: <span>🔍</span>,
    onSearch: (query) => console.log('Searching for:', query),
  },
}

export const Disabled: Story = {
  args: {
    placeholder: 'Search for domains...',
    disabled: true,
    onSearch: (query) => console.log('Searching for:', query),
  },
}

export const CustomButton: Story = {
  args: {
    placeholder: 'Search for domains...',
    // buttonText: 'Find',
    // buttonProps: { variant: 'secondary' },
    onSearch: (query) => console.log('Finding:', query),
  },
}

export const DifferentSizes: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <SearchField
        onSearch={(query) => console.log('Small search:', query)}
        // size="sm"
        // buttonProps={{ size: 'sm' }}
        placeholder="Small search field..."
      />
      <SearchField
        onSearch={(query) => console.log('Default search:', query)}
        // size="default"
        placeholder="Default search field..."
      />
      <SearchField
        onSearch={(query) => console.log('Large search:', query)}
        // size="lg"
        // buttonProps={{ size: 'lg' }}
        placeholder="Large search field..."
      />
    </div>
  ),
}

export const Interactive: Story = {
  render: () => (
    <div className="max-w-md">
      <h3 className="mb-4 font-semibold text-lg">Domain Search</h3>
      <SearchField
        onSearch={(query) => {
          console.log('Searching for:', query)
          alert(`Searching for: ${query}`)
        }}
        placeholder="Enter domain name..."
      />
    </div>
  ),
}

export const FormIntegration: Story = {
  render: () => (
    <div className="max-w-lg space-y-4">
      <h3 className="font-semibold text-lg">ENS Domain Search</h3>
      <SearchField
        onSearch={(query) => {
          console.log('Searching for domains:', query)
          setTimeout(() => {
            console.log('Search results for:', query)
          }, 1000)
        }}
        // buttonText="Check Availability"
        // buttonProps={{ variant: 'default' }}
        placeholder="Search for available domains..."
      />
      <p className="text-gray-600 text-sm">
        Search for .eth domains to check availability and pricing
      </p>
    </div>
  ),
}

export const WithValidation: Story = {
  args: {
    placeholder: 'Enter domain name...',
    // helperText: 'Enter a valid domain name (e.g., example.eth)',
    onSearch: (query) => {
      if (query.length < 3) {
        alert('Domain name must be at least 3 characters')
        return
      }
      console.log('Valid search:', query)
    },
  },
}

export const CustomStyling: Story = {
  args: {
    placeholder: 'Custom styled search...',
    className: 'max-w-xl',
    // buttonText: 'GO',
    // buttonProps: {
    //   variant: 'destructive',
    //   className: 'px-8',
    // },
    onSearch: (query) => console.log('Custom search:', query),
  },
}
