/** @jsxImportSource react */
import type { EmailContext } from '../context.js'
import { type RenderedEmail, renderEmail } from '../render.js'
import { AppHost, EmailLayout, EmailParagraph } from './EmailLayout.js'

const WelcomeEmail = ({ context }: { readonly context: EmailContext }) => (
  <EmailLayout
    context={context}
    preview="Your email is verified for ENS notifications"
    heading="You’re all set"
    action={{
      title: 'Choose what you hear about',
      body: (
        <>
          Go to <AppHost context={context} /> in your browser and open
          Notification Settings.
        </>
      ),
    }}
    reason="you verified this address in the ENS app"
  >
    <EmailParagraph centered>
      Your email is verified. We’ll let you know before your names expire and
      when one is transferred.
    </EmailParagraph>
  </EmailLayout>
)

export const renderWelcomeEmail = (
  context: EmailContext,
): Promise<RenderedEmail> =>
  renderEmail(
    context,
    'Welcome to ENS notifications',
    <WelcomeEmail context={context} />,
  )
