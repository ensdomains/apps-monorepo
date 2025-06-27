import { SearchField } from './SearchField'

export default {
  Default: (
    <SearchField
      placeholder="Search domains..."
      onSearch={(query) => console.log('Searching for:', query)}
    />
  ),

  WithValue: (
    <SearchField
      defaultValue="erni"
      placeholder="Search domains..."
      onSearch={(query) => console.log('Searching for:', query)}
    />
  ),

  LikeImage: (
    <div className="max-w-lg">
      <SearchField
        defaultValue="erni"
        onSearch={(query) => console.log('Searching for:', query)}
        onChange={(e) => console.log('Input changed:', e.target.value)}
      />
    </div>
  ),

  Disabled: (
    <SearchField
      placeholder="Search disabled..."
      disabled={true}
      onSearch={(query) => console.log('Searching for:', query)}
    />
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

  MobileLayout: (
    <div className="max-w-sm mx-auto p-4 bg-white">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Find your digital identity</h1>
        <p className="text-gray-600 text-sm mb-4">
          Register a .eth domain name to secure your web3 username, store your
          crypto addresses, and more.
        </p>
      </div>

      <SearchField
        defaultValue="erni"
        onSearch={(query) => alert(`Searching for: ${query}`)}
        onChange={(e) => console.log('Typing:', e.target.value)}
      />
    </div>
  ),

  FullWidth: (
    <div className="w-full max-w-2xl">
      <SearchField
        placeholder="Search for the perfect domain name..."
        onSearch={(query) => console.log('Full width search:', query)}
      />
    </div>
  ),

  WithHandlers: (
    <div className="max-w-lg space-y-4">
      <h3 className="text-lg font-semibold">Search with All Handlers</h3>
      <SearchField
        placeholder="Type and press Enter or click search..."
        onSearch={(query) => {
          console.log('Search triggered:', query)
          alert(`Search: ${query}`)
        }}
        onChange={(e) => {
          console.log('Input changed:', e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            const target = e.target as HTMLInputElement
            target.value = ''
            console.log('Cleared input')
          }
        }}
      />
      <p className="text-sm text-gray-600">
        Try typing, pressing Enter, clicking the mic (logs to console), or
        clicking search
      </p>
    </div>
  ),

  RealWorldExample: (
    <div className="w-full max-w-4xl mx-auto py-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-4">
          Your Web3 Identity Starts Here
        </h1>
        <p className="text-xl text-muted-foreground mb-8">
          Search for the perfect .eth domain name
        </p>
      </div>

      <SearchField
        placeholder="Enter your dream domain name"
        onSearch={(query) => {
          console.log('Real world search:', query)
          // In a real app, this would trigger domain availability checking
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
