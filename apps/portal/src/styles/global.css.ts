import { modeVars } from '@ensdomains/thorin'
import { globalStyle } from '@vanilla-extract/css'

import { globalFontFace } from '@vanilla-extract/css'

globalStyle('body', {
  backgroundColor: modeVars.color.background,
})

globalFontFace('Satoshi', [
  {
    src: `url('/fonts/sans/Satoshi-Regular.woff2')`,
    fontWeight: 400,
  },
  {
    src: `url('/fonts/sans/Satoshi-Medium.woff2')`,
    fontWeight: 500,
  },
  {
    src: `url('/fonts/sans/Satoshi-Bold.woff2')`,
    fontWeight: 700,
  },
  {
    src: `url('/fonts/sans/Satoshi-Black.woff2')`,
    fontWeight: 900,
  },
])
