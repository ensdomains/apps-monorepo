import { useState } from 'react'

export const ProfileLinkImage = ({ src }: { readonly src: string }) => {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>(
    'loading',
  )
  if (status === 'failed') return null

  return (
    <img
      alt=""
      className="absolute inset-0 size-full object-cover object-center"
      decoding="async"
      loading="lazy"
      onError={() => setStatus('failed')}
      onLoad={() => setStatus('loaded')}
      referrerPolicy="no-referrer"
      src={src}
      style={{ opacity: status === 'loaded' ? 1 : 0 }}
    />
  )
}
