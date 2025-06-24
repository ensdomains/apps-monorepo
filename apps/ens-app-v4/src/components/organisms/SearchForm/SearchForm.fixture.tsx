import { SearchForm } from './SearchForm'

export default {
  Default: (
    <SearchForm onSearch={(query) => console.log('Searching for:', query)} />
  ),

  WithPlaceholder: (
    <SearchForm
      placeholder="Search for ENS domains..."
      onSearch={(query) => console.log('Searching for:', query)}
    />
  ),

  Loading: (
    <SearchForm
      loading={true}
      onSearch={(query) => console.log('Searching for:', query)}
    />
  ),

  WithRecentSearches: (
    <SearchForm
      recentSearches={['example.eth', 'test.eth', 'myname.eth']}
      onSearch={(query) => console.log('Searching for:', query)}
      onRecentSearchSelect={(query: string) =>
        console.log('Selected recent search:', query)
      }
    />
  ),

  Interactive: (
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

  FullFeatured: (
    <div className="max-w-2xl">
      <SearchForm
        placeholder="Search domains..."
        recentSearches={['alice.eth', 'bob.eth', 'crypto.eth', 'web3.eth']}
        loading={false}
        onSearch={(query) => {
          console.log('Full search for:', query)
          // Simulate loading state
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

  MobileView: (
    <div className="max-w-sm">
      <SearchForm
        placeholder="Search..."
        onSearch={(query) => console.log('Mobile search:', query)}
      />
    </div>
  ),

  WithoutRecentSearches: (
    <SearchForm
      placeholder="Find domains..."
      showRecentSearches={false}
      onSearch={(query) => console.log('No recent searches:', query)}
    />
  ),

  RealWorldExample: (
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
          // In a real app, this would trigger domain availability checking
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
