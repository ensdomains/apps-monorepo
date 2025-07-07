import { useEffect, useState } from 'react'

export const useTheme = () => {
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme')
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
      .matches
      ? 'dark'
      : 'light'

    // Handle both quoted and unquoted values from localStorage
    let cleanTheme = savedTheme
    if (savedTheme?.startsWith('"') && savedTheme.endsWith('"')) {
      cleanTheme = savedTheme.slice(1, -1) // Remove quotes
    }

    const initialTheme = cleanTheme || systemTheme

    setTheme(initialTheme)
    applyTheme(initialTheme)
  }, [])

  const applyTheme = (newTheme: string) => {
    const root = document.documentElement

    if (newTheme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }

    localStorage.setItem('theme', newTheme)
  }

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    applyTheme(newTheme)
  }

  return { theme, toggleTheme }
}
