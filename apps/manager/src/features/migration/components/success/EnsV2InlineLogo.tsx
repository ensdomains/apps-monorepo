import ensV2Logo from '@/assets/migration/ens-v2-logo.svg'

export const EnsV2InlineLogo = () => (
  <img
    alt="ENSv2"
    // Match the SVG's 33.3 × 15.3 artwork bounds; -2px aligns it with the text baseline.
    className="pointer-events-none inline-block h-[15.3px] w-[33.3px] select-none align-[-2px]"
    draggable={false}
    height={16}
    src={ensV2Logo}
    width={34}
  />
)
