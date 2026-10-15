import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Custom shadows from theme.css, so `shadow-none` can override them like any other shadow.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: { shadow: ['shadow-temp-card', 'shadow-domain-card'] },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function truncateAddress(address?: string | null) {
  if (!address) return ''

  return `${address.slice(0, 6)}...${address.slice(-4)}`
}
