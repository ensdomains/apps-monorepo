import { useEffect, useRef, useState } from 'react'
import {
  type GeneratedLinkPattern,
  getGeneratedLinkPattern,
} from './ProfileLinks.helpers'

export const useLinkPreviewPattern = (href: string) => {
  const ref = useRef<HTMLDivElement>(null)
  const [generated, setGenerated] = useState<{
    href: string
    pattern: GeneratedLinkPattern
  }>()

  useEffect(() => {
    const element = ref.current
    if (!element) return

    let active = true
    const generate = () => {
      if (!active) return
      active = false
      setGenerated({ href, pattern: getGeneratedLinkPattern(href) })
    }

    // Keep the first render cheap even in browsers without observation support.
    if (typeof IntersectionObserver === 'undefined') {
      const timeout = setTimeout(generate, 0)
      return () => {
        active = false
        clearTimeout(timeout)
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!active || !entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        generate()
      },
      { rootMargin: '200px' },
    )
    observer.observe(element)
    return () => {
      active = false
      observer.disconnect()
    }
  }, [href])

  return {
    ref,
    pattern: generated?.href === href ? generated.pattern : undefined,
  }
}
