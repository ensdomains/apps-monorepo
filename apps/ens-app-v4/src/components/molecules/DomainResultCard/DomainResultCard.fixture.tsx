import { DomainResultCard } from './DomainResultCard'

export default {
  Available: (
    <DomainResultCard
      domainName="example.eth"
      status="available"
      price={45.2}
      onAction={() => alert('Registering example.eth')}
    />
  ),

  Premium: (
    <DomainResultCard
      domainName="premium.eth"
      status="premium"
      price={245000}
      onAction={() => alert('Registering premium.eth')}
    />
  ),

  Unavailable: <DomainResultCard domainName="taken.eth" status="unavailable" />,

  MultipleCards: (
    <div className="flex flex-col gap-4 max-w-md">
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

  DifferentLengths: (
    <div className="flex flex-col gap-4 max-w-md">
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

  PricingVariations: (
    <div className="flex flex-col gap-4 max-w-md">
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

  WithoutPricing: (
    <div className="flex flex-col gap-4 max-w-md">
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

  CustomLabels: (
    <div className="flex flex-col gap-4 max-w-md">
      <DomainResultCard
        domainName="custom.eth"
        status="available"
        price={50}
        priceLabel="per year"
        actionText="Buy Now"
        onAction={() => alert('Custom action!')}
      />
      <DomainResultCard
        domainName="another.eth"
        status="premium"
        price={1000}
        priceLabel="one-time"
        actionText="Learn More"
        onAction={() => alert('Learning more...')}
      />
    </div>
  ),

  InteractiveExample: (
    <div className="max-w-md">
      <h3 className="text-lg font-semibold mb-4">Domain Search Results</h3>
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
