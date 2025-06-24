import { Alert } from './Alert'

export default {
  Default: (
    <Alert title="Information" description="This is a default alert message." />
  ),

  Variants: (
    <div className="flex flex-col gap-4">
      <Alert
        variant="default"
        title="Information"
        description="This is an informational message."
      />
      <Alert
        variant="success"
        title="Success"
        description="Your action was completed successfully."
      />
      <Alert
        variant="warning"
        title="Warning"
        description="Please review this information carefully."
      />
      <Alert
        variant="destructive"
        title="Error"
        description="Something went wrong. Please try again."
      />
    </div>
  ),

  TitleOnly: (
    <div className="flex flex-col gap-4">
      <Alert variant="default" title="Just a title" />
      <Alert variant="success" title="Success!" />
      <Alert variant="warning" title="Warning!" />
      <Alert variant="destructive" title="Error!" />
    </div>
  ),

  DescriptionOnly: (
    <div className="flex flex-col gap-4">
      <Alert
        variant="default"
        description="Just a description without title."
      />
      <Alert
        variant="success"
        description="Operation completed successfully."
      />
      <Alert variant="warning" description="This action cannot be undone." />
      <Alert variant="destructive" description="Failed to save changes." />
    </div>
  ),

  CustomIcons: (
    <div className="flex flex-col gap-4">
      <Alert
        variant="default"
        title="Custom Icon"
        description="This alert uses a custom icon."
        icon={<span>🔔</span>}
      />
      <Alert
        variant="success"
        title="Custom Success"
        description="Custom icon for success state."
        icon={<span>🎉</span>}
      />
    </div>
  ),

  WithChildren: (
    <Alert variant="warning" title="Action Required">
      <p>Your subscription expires in 3 days.</p>
      <button
        type="button"
        className="mt-2 px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
      >
        Renew Subscription
      </button>
    </Alert>
  ),

  RealWorldExamples: (
    <div className="flex flex-col gap-4 max-w-2xl">
      <Alert
        variant="success"
        title="Domain registered successfully!"
        description="example.eth has been registered to your wallet."
      />

      <Alert
        variant="warning"
        title="Gas fees are high"
        description="Current network congestion may result in higher transaction costs."
      />

      <Alert
        variant="destructive"
        title="Transaction failed"
        description="Insufficient funds to complete the registration."
      />

      <Alert
        variant="default"
        title="ENS Domain Available"
        description="The domain you searched for is available for registration."
      />
    </div>
  ),

  SystemMessages: (
    <div className="space-y-4">
      <Alert variant="default">
        <div>
          <h4 className="font-semibold">System Maintenance</h4>
          <p className="mt-1">
            Our services will be temporarily unavailable on March 15th from 2:00
            AM to 4:00 AM UTC for scheduled maintenance.
          </p>
          <ul className="mt-2 list-disc list-inside text-sm">
            <li>Domain registration will be disabled</li>
            <li>Existing domains will continue to resolve</li>
            <li>Dashboard access may be limited</li>
          </ul>
        </div>
      </Alert>
    </div>
  ),
}
