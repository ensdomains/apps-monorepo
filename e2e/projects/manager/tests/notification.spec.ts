import { test, expect } from '../../../fixtures/playwright.manager.fixture.js'
import {
  createRandomInbox,
  createEmailAddress,
  expectMessageWithSubject,
  getMessageById,
  findVerifyLink,
  waitForMessage,
} from '../../../helpers/mailinator.js'

if (!process.env.MAILINATOR_API_KEY) {
  throw new Error('MAILINATOR_API_KEY must be set in .env to run notification e2e tests')
}

if (!process.env.MAILINATOR_DOMAIN) {
  throw new Error('MAILINATOR_DOMAIN must be set in .env to run notification e2e tests')
}

test.describe('Notifications email flow', () => {
  test('verify email + welcome message', async ({ authenticatedPage: page }) => {
    const inbox = createRandomInbox()
    const email = createEmailAddress(inbox)

    // authenticatedPage fixture already navigates to the app, so we start from there

    // Open notifications dropdown and settings
    await page.getByRole('button', { name: /Notifications/i }).click()
    await page.locator('a[href="/notifications/settings"]').click()
    await expect(page).toHaveURL(/\/notifications\/settings/)

    // Add email for verification
    const emailInput = page.getByPlaceholder(/Enter your email/i)
    await emailInput.fill(email)
    await page.getByRole('button', { name: /Send Verification/i }).click()

    // Wait for verify email to arrive in Mailinator
    const verifyMessage = await expectMessageWithSubject(
      inbox,
      'Verify your email address - ENS Notifications',
      90_000,
    )

    // Load full message body and extract the link
    const verifyMessageDetail = await getMessageById(verifyMessage.id)
    const verifyUrl = findVerifyLink(verifyMessageDetail)
    expect(verifyUrl).toContain('/notifications/channels/email/verify?token=')

    // Follow verify URL from email
    await page.goto(verifyUrl)

    // Wait for verification page to load
    await expect(page).toHaveURL(/\/notifications\/channels\/email\/verify/)

    // Check if verification succeeded by looking for success indicators
    const successTitle = page.getByText(/Email Verified!/i)
    const continueButton = page.getByRole('button', { name: /Continue to Settings/i })
    const verifyButton = page.getByRole('button', { name: /Verify Email Address/i })

    // If there's a verify button, click it (manual verification)
    try {
      await verifyButton.waitFor({ state: 'visible', timeout: 5_000 })
      await verifyButton.click()
    } catch {
      // No manual verify button, assume auto-verification
    }

    // Check if verification was successful
    const verificationSuccess = await Promise.race([
      successTitle.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false),
      continueButton.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false),
    ])

    expect(verificationSuccess).toBe(true)

    // Now verify welcome message has arrived
    await expectMessageWithSubject(inbox, 'Welcome to ENS Notifications', 90_000)

    // Extra safety: ensure the welcome email appears after verification
    const welcomeMessage = await waitForMessage(
      inbox,
      (m) => (m.subject || '').toLowerCase() === 'welcome to ens notifications',
      90_000,
    )
    expect(welcomeMessage.subject).toBe('Welcome to ENS Notifications')
  })
})
