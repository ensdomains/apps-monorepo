import { tw } from '@/utils/tailwind'

export const FilterBadge = (props: {
  active: boolean
  label: string
  size?: 'sm' | 'md'
}) => {
  return (
    <div
      className={tw(
        'cursor-not-allowed rounded-full font-normal leading-ens-tight',
        props.active
          ? 'bg-[#232222] text-white'
          : 'bg-ens-white text-[#7D7D7D]',
        props.size === 'sm' ? 'px-3 py-2 text-sm' : 'px-4 py-3 text-base',
      )}
    >
      {props.label}
    </div>
  )
}
