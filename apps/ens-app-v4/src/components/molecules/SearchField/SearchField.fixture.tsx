import { SearchField } from './SearchField'

export default {
  Default: (
    <SearchField
      placeholder="Search for domains..."
      onSearch={(query) => console.log('Searching for:', query)}
    />
  ),

  WithValue: (
    <SearchField
      placeholder="Search for domains..."
      defaultValue="example"
      onSearch={(query) => console.log('Searching for:', query)}
    />
  ),

  WithoutIcon: (
    <SearchField
      placeholder="Search for domains..."
      showSearchIcon={false}
      onSearch={(query) => console.log('Searching for:', query)}
    />
  ),

  CustomSearchIcon: (
    <SearchField
      placeholder="Search for domains..."
      searchIconElement={<span>🔍</span>}
      onSearch={(query) => console.log('Searching for:', query)}
    />
  ),

  Disabled: (
    <SearchField
      placeholder="Search for domains..."
      disabled={true}
      onSearch={(query) => console.log('Searching for:', query)}
    />
  ),

  CustomButton: (
    <SearchField
      placeholder="Search for domains..."
      buttonText="Find"
      buttonProps={{ variant: 'secondary' }}
      onSearch={(query) => console.log('Finding:', query)}
    />
  ),

  Different_Sizes: (
    <div className="flex flex-col gap-4">
      <SearchField
        placeholder="Small search field..."
        size="sm"
        buttonProps={{ size: 'sm' }}
        onSearch={(query) => console.log('Small search:', query)}
      />
      <SearchField
        placeholder="Default search field..."
        size="default"
        onSearch={(query) => console.log('Default search:', query)}
      />
      <SearchField
        placeholder="Large search field..."
        size="lg"
        buttonProps={{ size: 'lg' }}
        onSearch={(query) => console.log('Large search:', query)}
      />
    </div>
  ),

  Interactive: (
    <div className="max-w-md">
      <h3 className="text-lg font-semibold mb-4">Domain Search</h3>
      <SearchField
        placeholder="Enter domain name..."
        onSearch={(query) => {
          console.log('Searching for:', query)
          alert(`Searching for: ${query}`)
        }}
      />
    </div>
  ),

  FormIntegration: (
    <div className="max-w-lg space-y-4">
      <h3 className="text-lg font-semibold">ENS Domain Search</h3>
      <SearchField
        placeholder="Search for available domains..."
        buttonText="Check Availability"
        buttonProps={{ variant: 'default' }}
        onSearch={(query) => {
          console.log('Searching for domains:', query)
          // Simulate API call
          setTimeout(() => {
            console.log('Search results for:', query)
          }, 1000)
        }}
      />
      <p className="text-sm text-gray-600">
        Search for .eth domains to check availability and pricing
      </p>
    </div>
  ),

  WithValidation: (
    <SearchField
      placeholder="Enter domain name..."
      helperText="Enter a valid domain name (e.g., example.eth)"
      onSearch={(query) => {
        if (query.length < 3) {
          alert('Domain name must be at least 3 characters')
          return
        }
        console.log('Valid search:', query)
      }}
    />
  ),

  CustomStyling: (
    <SearchField
      placeholder="Custom styled search..."
      className="max-w-xl"
      buttonText="GO"
      buttonProps={{
        variant: 'destructive',
        className: 'px-8',
      }}
      onSearch={(query) => console.log('Custom search:', query)}
    />
  ),
}
