import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
import {
  createEmailAddress,
  createRandomInbox,
  expectMessageWithSubject,
  findVerificationCode,
  getMessageById,
  waitForMessage,
} from '../../../helpers/mailinator.js'

if (!process.env.MAILINATOR_API_KEY) {
  throw new Error(
    'MAILINATOR_API_KEY must be set in .env to run notification e2e tests',
  )
}

if (!process.env.MAILINATOR_DOMAIN) {
  throw new Error(
    'MAILINATOR_DOMAIN must be set in .env to run notification e2e tests',
  )
}

test.describe('Notifications email flow', () => {
  test('verify email + welcome message', async ({
    // The /notifications/settings route is gated by `RequireBackendAuth`
    // — without backend SIWE sign-in the route renders a "Verify
    // wallet ownership" prompt instead of the contact-methods form
    // we want to interact with. Use the sign-in fixture variant so
    // the rest of the spec runs against the actual settings UI.
    authenticatedPageWithBackend: page,
  }) => {
    const inbox = createRandomInbox()
    const email = createEmailAddress(inbox)

    // Navigate directly to notification settings after sign-in.
    await page.goto('/notifications/settings')
    await expect(page).toHaveURL(/\/notifications\/settings/)

    // Add email for verification
    const emailInput = page.getByPlaceholder(/Enter your email/i)
    await emailInput.fill(email)

    // Wait for the form to stabilise after validation re-render
    const sendBtn = page.getByRole('button', { name: /Send Verification/i })
    await sendBtn.waitFor({ state: 'attached', timeout: 10_000 })
    await page.waitForTimeout(500)
    await sendBtn.click()

    // Wait for verify email to arrive in Mailinator
    const verifyMessage = await expectMessageWithSubject(
      inbox,
      'Your ENS email verification code',
      90_000,
    )

    // The code can be read on another device and entered in this session.
    const verifyMessageDetail = await getMessageById(verifyMessage.id)
    const code = findVerificationCode(verifyMessageDetail)
    await expect(page.getByText('Pending', { exact: true })).toBeVisible()
    await page
      .getByRole('textbox', { name: /Email verification code/i })
      .fill(code)
    await page.getByRole('button', { name: /Verify Email/i }).click()
    await expect(page.getByText('Verified', { exact: true })).toBeVisible()

    // Now verify welcome message has arrived
    await expectMessageWithSubject(
      inbox,
      'Welcome to ENS Notifications',
      90_000,
    )

    // Extra safety: ensure the welcome email appears after verification
    const welcomeMessage = await waitForMessage(
      inbox,
      (m) => (m.subject || '').toLowerCase() === 'welcome to ens notifications',
      90_000,
    )
    expect(welcomeMessage.subject).toBe('Welcome to ENS Notifications')

    // Navigate back to settings and remove the email
    await page.goto('/notifications/settings')
    await expect(page).toHaveURL(/\/notifications\/settings/)

    // Find the email container by locating the text of the email address
    const emailContainer = page.locator(`text=${email}`).first()
    await emailContainer.waitFor({ state: 'visible', timeout: 10_000 })

    // Click the menu button for that email entry
    const menuButton = emailContainer.locator('xpath=following::button[1]')
    await menuButton.waitFor({ state: 'visible', timeout: 10_000 })
    await menuButton.click()

    // Click the Remove item in the opened dropdown menu
    const removeMenuItem = page
      .getByRole('menuitem', { name: /Remove/i })
      .first()
    await removeMenuItem.waitFor({ state: 'visible', timeout: 10_000 })
    await removeMenuItem.click()

    // Confirm removal in the dialog
    // const removeDialog = page.getByText("Remove Email Contact Method?")
    // await removeDialog.waitFor({ state: 'visible', timeout: 10_000 })
    const confirmRemoveButton = page
      .getByRole('button', { name: /Remove/i })
      .first()
    await confirmRemoveButton.click()

    // Verify the email has been removed
    await expect(emailContainer).toBeHidden()
  })
})
