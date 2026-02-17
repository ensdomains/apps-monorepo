import { Button } from '@/components/ui/button'

type RegisterNameCheckoutSummaryProps = {
  name: string
  duration: number
  durationLabel: string
}

export const RegisterNameCheckoutSummary = ({
  durationLabel,
}: RegisterNameCheckoutSummaryProps) => {
  return (
    <section
      className="py-9 lg:border-l lg:border-border p-6 col-span-2"
      aria-labelledby="checkout-heading"
    >
      <h2 id="checkout-heading" className="text-3xl font-medium mb-4">
        Register name
      </h2>
      <dl className="border border-border rounded-md p-4 space-y-3">
        <div className="flex items-center justify-between">
          <dt className="text-base font-normal">
            {durationLabel} registration
          </dt>
          <dd className="flex items-center gap-1 m-0">
            <span className="text-muted-foreground">—</span>
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-base font-normal">Est. gas cost</dt>
          <dd className="flex items-center gap-1 m-0">
            <span className="text-muted-foreground">—</span>
          </dd>
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <dt className="text-xl font-bold">Est. total</dt>
          <dd className="flex items-center gap-1 m-0">
            <span className="text-muted-foreground">—</span>
          </dd>
        </div>
      </dl>
      <Button className="w-full mt-4 h-12">Continue</Button>
    </section>
  )
}
