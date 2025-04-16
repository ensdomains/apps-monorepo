/**
 * 
 * @param {import('@ensdomains/thorin').Mode} newTheme 
 */
function setTheme(newTheme) {
  console.log({ newTheme })
  document.documentElement.setAttribute('data-theme', newTheme)
  window.__theme = newTheme
  window.__onThemeChange(newTheme)
}
window.__onThemeChange = () => { }
/**
 * 
 * @param {import('@ensdomains/thorin').Mode} newTheme 
 */
window.__setPreferredTheme = (newTheme) => {
  setTheme(newTheme)
  try {
    localStorage.setItem('theme', JSON.stringify(window.__theme))
  } catch { }
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
darkQuery.addEventListener('change', (event) => {
  window.__setPreferredTheme(event.matches ? 'dark' : 'light')
})

/**
 * 
 * @type {import('@ensdomains/thorin').Mode} newTheme 
 */
let preferredTheme
try {
  preferredTheme = JSON.parse(localStorage.getItem('theme'))
} catch { }

setTheme(preferredTheme || (darkQuery.matches ? 'dark' : 'light'))
