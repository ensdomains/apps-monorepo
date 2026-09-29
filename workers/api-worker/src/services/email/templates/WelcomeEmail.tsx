/** @jsxImportSource react */
import { Button, Heading, Text } from '@react-email/components'
import { type RenderedEmail, renderEmail } from '../render.js'
import { EmailLayout } from './EmailLayout.js'

export type WelcomeEmailProps = {
  managerAppUrl: string
}

const buttonStyle = {
  backgroundColor: '#2563eb',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '6px',
}

const WelcomeEmail = ({ managerAppUrl }: WelcomeEmailProps) => (
  <EmailLayout preview="Your email is verified for ENS notifications">
    <Heading as="h1">Welcome to ENS Notifications!</Heading>
    <Text>
      Your email has been successfully verified and you're all set to receive
      notifications about your ENS domains.
    </Text>
    <Text>You'll receive updates about:</Text>
    <ul>
      <li>Domain expiry reminders</li>
      <li>Domain transfers</li>
      <li>And other important events</li>
    </ul>
    <Button
      href={`${managerAppUrl}/notifications/settings`}
      style={buttonStyle}
    >
      Manage Notification Preferences
    </Button>
    <Text>
      You can customize which notifications you receive at any time from your
      notification settings.
    </Text>
  </EmailLayout>
)

export const renderWelcomeEmail = (
  props: WelcomeEmailProps,
): Promise<RenderedEmail> =>
  renderEmail('Welcome to ENS Notifications', <WelcomeEmail {...props} />)
