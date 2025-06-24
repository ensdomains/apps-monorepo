import { RegistrationOption } from './RegistrationOption'

export default {
  OneYear: (
    <RegistrationOption
      years={1}
      pricePerYear={45.2}
      selected={false}
      onSelect={(years) => console.log('Selected', years, 'year(s)')}
    />
  ),

  TwoYears: (
    <RegistrationOption
      years={2}
      pricePerYear={42.7}
      selected={false}
      onSelect={(years) => console.log('Selected', years, 'year(s)')}
    />
  ),

  FiveYears: (
    <RegistrationOption
      years={5}
      pricePerYear={40.0}
      selected={false}
      onSelect={(years) => console.log('Selected', years, 'year(s)')}
    />
  ),

  Selected: (
    <RegistrationOption
      years={3}
      pricePerYear={41.87}
      selected={true}
      onSelect={(years) => console.log('Selected', years, 'year(s)')}
    />
  ),

  Disabled: (
    <RegistrationOption
      years={10}
      pricePerYear={40.0}
      selected={false}
      disabled={true}
      onSelect={(years) => console.log('Selected', years, 'year(s)')}
    />
  ),

  MultipleOptions: (
    <div className="flex flex-col gap-3 max-w-md">
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

  WithDiscounts: (
    <div className="space-y-4 max-w-md">
      <h3 className="text-lg font-semibold">Choose Registration Period</h3>
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
      <p className="text-sm text-gray-600">
        Longer registrations offer better value and protection
      </p>
    </div>
  ),

  Interactive: (
    <div className="max-w-md">
      <h3 className="text-lg font-semibold mb-4">Registration Duration</h3>
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

  CustomPricing: (
    <div className="flex flex-col gap-3 max-w-md">
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

  HighValue: (
    <div className="flex flex-col gap-3 max-w-md">
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
