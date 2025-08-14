import { ImageResponse } from 'workers-og'
import placeholderAvatar from '../assets/placeholder-avatar.svg?inline'
import { verifyAvatar } from '../features/profile/avatar'
import {
  AvatarCard,
  DescriptionBlock,
  HeaderBar,
  NameHeadline,
  SocialRow,
} from '../features/profile/components'
import { COLORS, HEIGHT, WIDTH } from '../features/profile/constants'
import { getProfile } from '../utils/enstate'
import { createApp } from '../utils/hono'
import { logger, prettifyError } from '../utils/logger'

const app = createApp()

app.get('/:name/og', async (c) => {
  const name = c.req.param('name')
  try {
    const profile = await getProfile(name).catch((e) => {
      logger.error(prettifyError(e))
      return null
    })

    if (!profile) {
      return new Response(`Profile not found`, {
        status: 404,
      })
    }

    const maxNameWidthPx = 700
    const maxFontSizePx = 96
    const minFontSizePx = 28
    const averageGlyphWidthRatio = 0.56
    const glyphCount = Math.max(1, Array.from(name).length)
    const computedFontSizePx = Math.max(
      minFontSizePx,
      Math.min(
        maxFontSizePx,
        Math.floor(maxNameWidthPx / (glyphCount * averageGlyphWidthRatio)),
      ),
    )

    const avatar = await verifyAvatar(profile.avatar)

    const element = (
      <div
        style={{
          width: `${WIDTH}px`,
          height: `${HEIGHT}px`,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: COLORS.blue,
          color: COLORS.lightBlue,
          paddingBottom: '60px',
        }}
      >
        <div
          style={{
            position: 'relative',
            padding: '32px 40px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            gap: '32px',
          }}
        >
          <AvatarCard src={avatar || placeholderAvatar} />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              maxWidth: '700px',
            }}
          >
            <NameHeadline
              text={name}
              fontSizePx={computedFontSizePx}
              maxWidthPx={maxNameWidthPx}
            />
            {profile.records.description && (
              <DescriptionBlock text={profile.records.description} />
            )}
            {(profile.records['com.twitter'] ||
              profile.records['com.github'] ||
              profile.records.url ||
              profile.records.location ||
              profile.records.email) && (
              <SocialRow
                socials={{
                  twitter: profile.records['com.twitter'],
                  github: profile.records['com.github'],
                  website: profile.records.url,
                  location: profile.records.location,
                  email: profile.records.email,
                }}
              />
            )}
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            left: '0px',
            bottom: '0px',
            right: '0px',
            display: 'flex',
          }}
        >
          <HeaderBar label={name} address={profile.address} />
        </div>
      </div>
    )

    return new ImageResponse(element, {
      width: WIDTH,
      height: HEIGHT,
      emoji: 'noto',
      headers: {
        'Cache-Control':
          'public, max-age=3600, s-maxage=43200, stale-while-revalidate=43200, stale-if-error=86400',
        'CDN-Cache-Control':
          'public, max-age=3600, s-maxage=43200, stale-while-revalidate=43200, stale-if-error=86400',
        'Cloudflare-CDN-Cache-Control':
          'public, max-age=3600, s-maxage=43200, stale-while-revalidate=43200, stale-if-error=86400',
      },
    })
  } catch (e) {
    logger.error(prettifyError(e))

    return new Response(
      `Failed to generate OG image for profile: ${name}. Error: ${e && typeof e === 'object' && 'message' in e ? e.message : String(e)}`,
      {
        status: 500,
      },
    )
  }
})

export default app
