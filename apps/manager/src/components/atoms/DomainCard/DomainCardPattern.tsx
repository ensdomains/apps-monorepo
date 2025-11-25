'use client'

import { memo } from 'react'

interface DomainCardPatternProps {
  variant: 'garnet' | 'lapis' | 'peridot'
  domainName: string
}

const patternColors: Record<
  'garnet' | 'lapis' | 'peridot',
  { core: string; dust: string }
> = {
  garnet: {
    core: 'var(--color-ens-garnet-core)',
    dust: 'var(--color-ens-garnet-dust)',
  },
  lapis: {
    core: 'var(--color-ens-lapis-core)',
    dust: 'var(--color-ens-lapis-dust)',
  },
  peridot: {
    core: 'var(--color-ens-peridot-core)',
    dust: 'var(--color-ens-peridot-dust)',
  },
}

/**
 * DomainCardPattern - Memoized SVG pattern component
 * The idea witht his maybe then we can have a different pattern for each domain
 * need to think about how to do this with the domain name and talk with design team.
 */
export const DomainCardPattern = memo(function DomainCardPattern({
  variant,
  domainName,
}: DomainCardPatternProps) {
  const patternColor = patternColors[variant]

  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 338 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      className="h-full w-full rounded"
      preserveAspectRatio="none"
    >
      <title>{`${domainName} background pattern`}</title>
      <rect
        width="338"
        height="200"
        rx="12"
        fill={`url(#pattern_${variant})`}
      />
      <defs>
        <pattern
          id={`pattern_${variant}`}
          patternUnits="userSpaceOnUse"
          patternTransform="matrix(148.93 0 0 278.095 54.4387 21.8301)"
          preserveAspectRatio="none"
          viewBox="0 -18.6691 297.859 556.19"
          width="1"
          height="1"
        >
          <use
            xlinkHref={`#pattern_${variant}_inner`}
            transform="translate(-446.789 -278.095)"
          />
          <use
            xlinkHref={`#pattern_${variant}_inner`}
            transform="translate(-148.93 -278.095)"
          />
          <use
            xlinkHref={`#pattern_${variant}_inner`}
            transform="translate(148.93 -278.095)"
          />
          <use
            xlinkHref={`#pattern_${variant}_inner`}
            transform="translate(-595.718 0)"
          />
          <use
            xlinkHref={`#pattern_${variant}_inner`}
            transform="translate(-297.859 0)"
          />
          <g id={`pattern_${variant}_inner`}>
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 -0.965283 0.0658205)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 48.7852 -7.04279)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 68.7969 48.8387)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 37.441 2.75143)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 87.1914 -4.35718)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 107.203 51.5244)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 75.8472 5.4371)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 125.598 -1.67151)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 145.609 54.21)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 211.468 46.1438)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 261.219 39.0352)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 281.23 94.9167)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 114.253 8.12271)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 164.004 1.0141)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 184.016 56.8956)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 249.875 48.8294)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 299.625 41.7208)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 319.637 97.6024)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 191.066 13.4939)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 240.816 6.38531)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 260.828 62.2668)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 229.472 16.1796)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 279.223 9.07098)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 299.234 64.9525)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 288.281 51.515)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 338.031 44.4064)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 358.043 100.288)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 19.4371 32.7157)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 69.1875 25.6071)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 89.1992 81.4886)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 57.8433 35.4013)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 107.594 28.2927)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 127.605 84.1742)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 96.2496 38.0869)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 146 30.9783)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 166.012 86.8599)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 134.656 40.7725)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 184.406 33.6639)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 204.418 89.5455)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 39.8394 65.3655)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 89.5898 58.2569)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 109.602 114.138)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 155.056 73.4224)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 204.807 66.3138)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 224.818 122.195)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 193.462 76.108)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 243.213 68.9994)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 263.225 124.881)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 231.869 78.7937)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 281.619 71.6851)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 301.631 127.567)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 270.275 81.4793)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 320.025 74.3707)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 340.037 130.252)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 308.681 84.1649)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 358.432 77.0563)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 378.443 132.938)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 60.2398 98.0154)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 109.99 90.9068)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 130.002 146.788)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 175.459 106.072)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 225.209 98.9636)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 245.221 154.845)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 213.865 108.758)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 263.615 101.649)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 283.627 157.531)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 252.271 111.444)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 302.021 104.335)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 322.033 160.216)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 290.677 114.129)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 340.428 107.021)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 360.439 162.902)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 329.084 116.815)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 378.834 109.706)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 398.846 165.588)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 80.6421 130.665)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 130.393 123.557)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 150.404 179.438)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 119.048 133.351)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 168.799 126.242)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 188.811 182.124)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 195.861 138.722)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 245.611 131.614)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 265.623 187.495)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 234.267 141.408)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 284.018 134.299)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 304.029 190.181)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 311.08 146.779)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 360.83 139.67)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 380.842 195.552)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 349.486 149.465)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 399.236 142.356)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 419.248 198.238)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 101.044 163.315)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 150.795 156.206)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 170.807 212.088)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 139.451 166.001)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 189.201 158.892)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 209.213 214.774)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 141.847 228.615)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 191.598 221.506)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 211.609 277.388)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 180.253 231.3)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 230.004 224.192)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 250.016 280.073)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 372.285 244.729)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 422.035 237.62)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 442.047 293.501)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              x="3.05497"
              y="1.83561"
              width="26.5"
              height="26.5"
              rx="13.25"
              transform="matrix(0.997564 0.0697565 0.529919 0.848048 410.691 247.414)"
              stroke={patternColor.core}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-0.292779 0.572649 -1.09098 -0.629384 460.441 240.306)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
            <rect
              width="44"
              height="18"
              rx="4"
              transform="matrix(-1.0679 -0.667797 0.368168 -0.527351 480.453 296.187)"
              stroke={patternColor.dust}
              strokeWidth="4"
            />
          </g>
          <use
            xlinkHref={`#pattern_${variant}_inner`}
            transform="translate(-446.789 278.095)"
          />
          <use
            xlinkHref={`#pattern_${variant}_inner`}
            transform="translate(-148.93 278.095)"
          />
          <use
            xlinkHref={`#pattern_${variant}_inner`}
            transform="translate(148.93 278.095)"
          />
        </pattern>
      </defs>
    </svg>
  )
})
