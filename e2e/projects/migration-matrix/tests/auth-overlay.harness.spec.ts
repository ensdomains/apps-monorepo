import { expect, test } from '@playwright/test'
import { dismissMatrixBackendOverlay } from '../../../helpers/manager-auth.js'

const overlay =
  '<div role="alertdialog" aria-label="Verify your wallet" tabindex="0">Verify your wallet</div>'

test('a closed session does not reject from its optional auth handler', async ({
  page,
}) => {
  await page.close()
  await expect(dismissMatrixBackendOverlay(page)).resolves.toBeUndefined()
})

test('an open auth prompt must actually dismiss', async ({ page }) => {
  await page.setContent(overlay)
  await page.evaluate(() => {
    let keys = ''
    document.addEventListener('keydown', (event) => {
      keys += event.key
      if (keys.endsWith('skip'))
        document.querySelector('[role=alertdialog]')?.remove()
    })
  })
  await dismissMatrixBackendOverlay(page)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
})

test('closing while dismissal is pending cannot leak a rejection', async ({
  page,
}) => {
  await page.setContent(overlay)
  const dismissing = dismissMatrixBackendOverlay(page)
  await page.waitForTimeout(100)
  await page.close()
  await expect(dismissing).resolves.toBeUndefined()
})

test('an open prompt that refuses dismissal still fails', async ({ page }) => {
  await page.setContent(overlay)
  await expect(dismissMatrixBackendOverlay(page)).rejects.toThrow(
    'Local test auth overlay must be dismissed',
  )
  await expect(page.getByRole('alertdialog')).toBeVisible()
})
