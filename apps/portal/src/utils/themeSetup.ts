import type { Mode } from "@ensdomains/thorin"

  ; (() => {
    function setTheme(newTheme: Mode) {
      document.documentElement.setAttribute('data-theme', newTheme)
      window.__theme = newTheme
      window.__onThemeChange(newTheme)
    }
    window.__onThemeChange = () => { }
    window.__setPreferredTheme = (newTheme: Mode) => {
      setTheme(newTheme)
      try {
        localStorage.setItem('theme', JSON.stringify(window.__theme))
      } catch { }
    }

    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
    darkQuery.addEventListener('change', (event) => {
      window.__setPreferredTheme(event.matches ? 'dark' : 'light')
    })

    let preferredTheme: Mode | undefined
    try {
      // biome-ignore lint/style/noNonNullAssertion: <explanation>
      preferredTheme = JSON.parse(localStorage.getItem('theme')!)
    } catch { }

    setTheme(preferredTheme || (darkQuery.matches ? 'dark' : 'light'))
  })()
