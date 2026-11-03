import { describe, expect, it } from 'vitest'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  editActionClassName,
  renewActionClassName,
} from './ProfileAction.styles'

describe('ProfileViewAction styles', () => {
  it('uses themed edit button colors on mobile and desktop', () => {
    const classes = editActionClassName.split(' ')

    expect(classes).toEqual(expect.arrayContaining(['border-none']))
    expect(classes).toEqual(
      expect.arrayContaining([
        'bg-(--theme-button-bg)',
        'text-(--theme-button-text)',
        'hover:bg-(--theme-button-hover-bg)',
      ]),
    )
    expect(classes).not.toEqual(
      expect.arrayContaining([
        'bg-white',
        'border-ens-quartz-900',
        'text-ens-quartz-900',
      ]),
    )
  })

  it('drops the default button stroke from the renew link', () => {
    // LinkButton merges the default variant, which carries a 1px border
    const classes = cn(
      buttonVariants({ className: renewActionClassName }),
    ).split(' ')

    expect(classes).not.toContain('border')
  })
})
