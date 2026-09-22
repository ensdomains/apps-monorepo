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

    let isActive = true
    const generate = () => {
      if (!isActive) return
      isActive = false
      setGenerated({ href, pattern: getGeneratedLinkPattern(href) })
    }

    // Keep the first render cheap even in browsers without observation support.
    if (typeof IntersectionObserver === 'undefined') {
      const timeout = setTimeout(generate, 0)
      return () => {
        isActive = false
        clearTimeout(timeout)
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!isActive || !entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        generate()
      },
      { rootMargin: '200px' },
    )
    observer.observe(element)
    return () => {
      isActive = false
      observer.disconnect()
    }
  }, [href])

  return {
    ref,
    pattern: generated?.href === href ? generated.pattern : undefined,
  }
}
