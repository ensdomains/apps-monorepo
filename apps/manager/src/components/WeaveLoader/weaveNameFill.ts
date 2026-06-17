import type { NameFillProps } from './NameFill'

/** Figma spec for the registration name fill (node 1209-29493). */
export const WEAVE_REGISTRATION_NAME_FILL = {
  baseColor: '#D3D3D3',
  fill: '#000000',
  fontFamily: 'var(--font-mono)',
  fontSize: 31.68,
  fontWeight: 500,
  letterSpacing: '-1.267px',
  lineHeight: '90%',
} as const satisfies Pick<
  NameFillProps,
  | 'baseColor'
  | 'fill'
  | 'fontFamily'
  | 'fontSize'
  | 'fontWeight'
  | 'letterSpacing'
  | 'lineHeight'
>

/** Names longer than this use the compact 24px size. */
export const WEAVE_REGISTRATION_NAME_FILL_SMALL_FONT_THRESHOLD =
  'thisisanincrediblylongnametotestlongnameswiththisisani'.length

export const WEAVE_REGISTRATION_NAME_FILL_COMPACT = {
  ...WEAVE_REGISTRATION_NAME_FILL,
  fontSize: 24,
} as const satisfies Pick<
  NameFillProps,
  | 'baseColor'
  | 'fill'
  | 'fontFamily'
  | 'fontSize'
  | 'fontWeight'
  | 'letterSpacing'
  | 'lineHeight'
>

export function weaveRegistrationNameFillFor(name: string) {
  return name.length > WEAVE_REGISTRATION_NAME_FILL_SMALL_FONT_THRESHOLD
    ? WEAVE_REGISTRATION_NAME_FILL_COMPACT
    : WEAVE_REGISTRATION_NAME_FILL
}

/** Min gap (px) between step label and name when the name wraps. */
export const WEAVE_REGISTRATION_HEADLINE_NAME_GAP_MIN_PX = 24

/** Stress-test label for multi-line fill stories. */
export const WEAVE_REGISTRATION_LONG_NAME =
  'thisisanincrediblylongnametotestlongnameswiththisisanincrediblylongnametotestlongnameswiththisisanincrediblylongnametotestlongnameswiththisisanincrediblylongnametotestlongnameswiththisisanincrediblylongnametotestlongnameswiththisisanincrediblylongnamt.eth'
