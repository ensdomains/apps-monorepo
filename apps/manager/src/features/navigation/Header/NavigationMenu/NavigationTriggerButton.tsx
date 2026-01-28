import { ChevronDownIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import ensLogo from '@/assets/icons/ens.svg'
import ensMobileLogo from '@/assets/icons/ens-mobile.svg'
import { useMediaQuery } from '@/hooks/useMediaQuery'

export const NavigationTriggerButton = (
  props: ButtonHTMLAttributes<HTMLButtonElement>,
) => {
  const isDesktop = useMediaQuery('(min-width: 768px)')

  return (
    <button
      {...props}
      className="group flex shrink-0 items-center gap-1 py-2"
      type="button"
    >
      <img
        alt="ENS Logo"
        className="h-8 shrink-0"
        src={isDesktop ? ensLogo : ensMobileLogo}
      />
      <ChevronDownIcon className="group-data-[state=open]:-rotate-180 size-4 shrink-0 text-gray-500 transition-transform duration-200 md:size-5" />
    </button>
  )
}
