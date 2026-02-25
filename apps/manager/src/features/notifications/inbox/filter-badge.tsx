import { tw } from '@/utils/tailwind'

export const FilterBadge = (props: {
  active: boolean
  label: string
  size?: 'sm' | 'md'
  onClick?: () => void
}) => {
  return (
    <button
      className={tw(
        'cursor-pointer rounded-full font-normal leading-ens-tight transition-colors',
        props.active
          ? 'bg-[#232222] text-white'
          : 'bg-ens-white text-[#7D7D7D] hover:bg-[#f4f4f6]',
        props.size === 'sm' ? 'px-3 py-2 text-sm' : 'px-4 py-3 text-base',
      )}
      onClick={props.onClick}
      type="button"
    >
      {props.label}
    </button>
  )
}
