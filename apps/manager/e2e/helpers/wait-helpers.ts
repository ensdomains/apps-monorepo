/**
 * Simple wait utility for E2E (e.g. wait for balance to appear, modals to close).
 * Prefer stagehand.act and assertions over fixed sleeps where possible.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Helper to interact with Para modal Shadow DOM elements.
 * Para SDK uses web components (cpsl-input, cpsl-auth-modal) with Shadow DOM.
 * Playwright's locator API handles Shadow DOM automatically via piercing.
 * Note: Stagehand's page object may not have full Playwright API, so we use waitForSelector + evaluate.
 */
export async function fillParaEmailInput(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  email: string,
): Promise<void> {
  // Wait for the modal / web component to be in the DOM
  await sleep(3000)

  const filled = await page.evaluate((emailValue: string): boolean => {
    try {
      const root = document.body
      const cpslInputs = root.querySelectorAll('cpsl-input')
      for (let i = 0; i < cpslInputs.length; i++) {
        const el = cpslInputs[i] as any
        if (!el?.shadowRoot) continue
        const input =
          el.shadowRoot.querySelector('input[type="email"]') ||
          el.shadowRoot.querySelector('input[placeholder*="email" i]')
        if (input) {
          ;(input as HTMLInputElement).focus()
          ;(input as HTMLInputElement).value = emailValue
          ;(input as HTMLInputElement).dispatchEvent(
            new Event('input', { bubbles: true }),
          )
          ;(input as HTMLInputElement).dispatchEvent(
            new Event('change', { bubbles: true }),
          )
          return true
        }
      }
      return false
    } catch {
      return false
    }
  }, email)
  if (!filled)
    throw new Error('Could not find or fill email input in Para modal')
}

/**
 * Click the black right-arrow button next to the email field in the Para modal.
 * Structure: cpsl-input (#authInput) -> shadowRoot -> cpsl-button[slot="end"] -> shadowRoot -> button.button-native
 */
export async function clickParaEmailContinueButton(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
): Promise<void> {
  // Retry up to 5 times with increasing delays
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(500 + attempt * 500) // 500ms, 1s, 1.5s, 2s, 2.5s

    const clicked = await page.evaluate((): boolean => {
      try {
        // Strategy 1: Find cpsl-input with email input-mode or authInput id
        const findEmailInput = (): any => {
          return (
            document.querySelector('cpsl-input#authInput') ||
            document.querySelector('cpsl-input[data-testid="auth-input"]') ||
            document.querySelector('cpsl-input[input-mode="email"]') ||
            Array.from(document.querySelectorAll('cpsl-input')).find(
              (el: any) => {
                if (!el?.shadowRoot) return false
                const input = el.shadowRoot.querySelector('input[type="email"]')
                return !!input
              },
            )
          )
        }

        const cpslInput = findEmailInput()
        if (!cpslInput?.shadowRoot) return false

        // Verify email input has a value (button might be disabled until email is entered)
        const emailInput = cpslInput.shadowRoot.querySelector(
          'input[type="email"]',
        ) as HTMLInputElement
        if (
          !emailInput ||
          !emailInput.value ||
          emailInput.value.trim().length === 0
        ) {
          return false // Email not filled yet
        }

        // Find the continue button: cpsl-button[slot="end"] inside cpsl-input's shadow
        const cpslButton = cpslInput.shadowRoot.querySelector(
          'cpsl-button[slot="end"]',
        )
        if (!cpslButton) return false

        // Get the native button inside cpsl-button's shadow root
        if (!cpslButton.shadowRoot) return false
        const nativeButton =
          cpslButton.shadowRoot.querySelector('button.button-native') ||
          cpslButton.shadowRoot.querySelector('button[part="button-native"]') ||
          cpslButton.shadowRoot.querySelector('button[type="button"]')

        if (nativeButton) {
          const btn = nativeButton as HTMLButtonElement
          // Ensure button is visible and enabled
          if (btn.offsetParent === null || btn.disabled) return false
          btn.click()
          return true
        }

        // Fallback: search more broadly for any button with arrow icon inside cpsl-input shadow
        const allButtons = cpslInput.shadowRoot.querySelectorAll(
          'button, cpsl-button',
        )
        for (let i = 0; i < allButtons.length; i++) {
          const el = allButtons[i] as any
          if (el.tagName === 'CPSL-BUTTON' && el.shadowRoot) {
            const btn = el.shadowRoot.querySelector('button')
            if (btn && btn.offsetParent !== null && !btn.disabled) {
              // Check if it has an arrow icon (cpsl-icon with arrowNarrow)
              const hasArrow =
                el.shadowRoot.querySelector('cpsl-icon[icon="arrowNarrow"]') !==
                null
              if (hasArrow) {
                ;(btn as HTMLButtonElement).click()
                return true
              }
            }
          }
        }
        return false
      } catch (e) {
        console.error('Error clicking continue button:', e)
        return false
      }
    })

    if (clicked) return
  }

  throw new Error(
    'Could not find or click the continue/right arrow button in Para modal after 5 attempts',
  )
}

export async function fillParaPasswordInput(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  password: string,
): Promise<void> {
  await sleep(1000)

  const filled = await page.evaluate((passwordValue: string): boolean => {
    try {
      const cpslInputs = Array.from(
        document.querySelectorAll('cpsl-input'),
      ) as any[]
      for (const cpslInput of cpslInputs) {
        if (!cpslInput?.shadowRoot) continue
        const input =
          cpslInput.shadowRoot.querySelector('input[type="password"]') ||
          cpslInput.shadowRoot.querySelector('input[placeholder*="PIN" i]') ||
          cpslInput.shadowRoot.querySelector('input[placeholder*="Password" i]')
        if (input) {
          const inp = input as HTMLInputElement
          inp.focus()
          inp.value = passwordValue
          inp.dispatchEvent(new Event('input', { bubbles: true }))
          inp.dispatchEvent(new Event('change', { bubbles: true }))
          return true
        }
      }
      return false
    } catch {
      return false
    }
  }, password)
  if (!filled)
    throw new Error('Could not find or fill password/PIN input in Para modal')
}

export async function clickParaSignInButton(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
): Promise<void> {
  await sleep(1000)

  const clicked = await page.evaluate((): boolean => {
    try {
      const buttons = Array.from(document.querySelectorAll('button'))
      const signInButton = buttons.find(
        (btn) =>
          btn.textContent?.includes('Sign in with Wallet') ||
          btn.textContent?.includes('Sign in'),
      )
      if (signInButton) {
        signInButton.click()
        return true
      }
      return false
    } catch {
      return false
    }
  })
  if (!clicked)
    throw new Error('Could not find or click Sign in with Wallet button')
}
