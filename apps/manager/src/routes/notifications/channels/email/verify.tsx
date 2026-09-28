import { Trans } from '@lingui/react/macro'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

// Historic magic-link URLs no longer redeem email verification. Codes are
// entered in the authenticated Notification Settings session instead.
export const Route = createFileRoute('/notifications/channels/email/verify')({
  component: () => (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
      <h1 className="font-semibold text-xl">
        <Trans>Email verification</Trans>
      </h1>
      <p>
        <Trans>
          Enter the code from your email in Notification Settings while signed
          in to the account that requested it.
        </Trans>
      </p>
      <Button asChild variant="lightBlue">
        <Link to="/notifications/settings">
          <Trans>Open Notification Settings</Trans>
        </Link>
      </Button>
    </div>
  ),
})
