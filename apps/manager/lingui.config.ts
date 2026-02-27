import { formatter } from '@lingui/format-json'

const config = {
  locales: ['en', 'es', 'fr'],
  sourceLocale: 'en',
  catalogs: [
    {
      path: 'locales/{locale}/dashboard',
      include: ['src/'],
    },
  ],
  format: formatter({ style: 'minimal' }),
}

export default config
