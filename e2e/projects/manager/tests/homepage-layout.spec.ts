import { expect, test } from '@playwright/test'

test.use({
  viewport: { width: 480, height: 850 },
  isMobile: true,
  hasTouch: true,
})

test('the homepage heading and consent controls fit with enlarged text', async ({
  page,
}) => {
  await page.goto('/')

  const heading = page.getByRole('heading', { name: 'Find your name' })
  const consent = page.getByRole('region', { name: 'Analytics consent' })
  await expect(consent).toBeVisible()
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  await heading.evaluate((element) => {
    // The heading uses viewport units and pixels, so scale it independently of rem text.
    const fontSize = Number.parseFloat(getComputedStyle(element).fontSize)
    element.style.fontSize = `${fontSize * 2}px`
  })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))

  const headingFits = await heading.evaluate((element) => {
    const text = document.createRange()
    text.selectNodeContents(element)
    const { left, right } = text.getBoundingClientRect()
    return left >= 0 && right <= document.documentElement.clientWidth
  })
  expect.soft(headingFits).toBe(true)

  const consentFits = await consent.evaluate((element) => {
    const { left, right } = element.getBoundingClientRect()
    return (
      left >= 0 &&
      right <= document.documentElement.clientWidth &&
      element.scrollWidth <= element.clientWidth
    )
  })
  expect.soft(consentFits).toBe(true)

  for (const name of ['Yes, happy to help', 'No thanks']) {
    await consent.getByRole('button', { name }).tap({ trial: true })
  }
})
