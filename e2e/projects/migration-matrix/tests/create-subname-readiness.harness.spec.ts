import { expect, test } from '@playwright/test'
import { createSubnameReadiness } from '../create-subname-readiness.js'

const owner = '0x0000000000000000000000000000000000000001'
const form = `<form><label>Subname<input value="checked"></label><label>Owner<input value="${owner}"></label><button disabled>Create subname</button></form>`

test('creation readiness waits for the availability check to enable the requested inputs', async ({
  page,
}) => {
  await page.setContent(form)
  await page.evaluate(() =>
    setTimeout(() => {
      document.querySelector('button')!.disabled = false
    }, 80),
  )
  expect(
    (await createSubnameReadiness(page, 'checked', owner, 1000)).result,
  ).toBe('ready')
})

test('an explicit label lookup error remains a product error, not pending readiness', async ({
  page,
}) => {
  await page.setContent(
    form.replace(
      '</form>',
      '<p class="text-danger">Could not check whether checked.example.eth is already registered.</p></form>',
    ),
  )
  expect(await createSubnameReadiness(page, 'checked', owner, 1000)).toEqual({
    result: 'error',
    detail:
      'Could not check whether checked.example.eth is already registered.',
  })
})

test('an unresolved disabled form cannot pass or imply an authorization failure', async ({
  page,
}) => {
  await page.setContent(form)
  expect(
    (await createSubnameReadiness(page, 'checked', owner, 100)).result,
  ).toBe('pending')
})

test('an enabled form with reset input values is not ready for the requested creation', async ({
  page,
}) => {
  await page.setContent(
    form
      .replace('value="checked"', 'value=""')
      .replace('button disabled', 'button'),
  )
  expect(
    (await createSubnameReadiness(page, 'checked', owner, 100)).result,
  ).toBe('pending')
})
