// Bead grid geometry: ~4 rows in an 18px-tall bar → 4.5px vertical cell.
const H_CELL = 5
const V_CELL = 4.5

/**
 * The continuous colour field, before it's masked into beads: light-blue tiles
 * on top, pink on the bottom, with a solid colour column every ~3rd cell. Blue
 * is the default column; magenta / green / black land on every 5th / 7th / 11th
 * column (drawn on top so they replace the blue there).
 */
const COLOR_FIELD = [
  'repeating-linear-gradient(90deg, transparent 0 160px, var(--color-ens-quartz-900) 160px 165px)', // black (every 11th)
  'repeating-linear-gradient(90deg, transparent 0 100px, var(--color-ens-peridot-core) 100px 105px)', // green (every 7th)
  'repeating-linear-gradient(90deg, transparent 0 70px, var(--color-ens-magenta) 70px 75px)', // magenta (every 5th)
  'repeating-linear-gradient(90deg, transparent 0 10px, var(--color-ens-lapis-core) 10px 15px)', // blue (every 3rd)
  'linear-gradient(to bottom, color-mix(in srgb, var(--color-ens-lapis-300), var(--color-ens-lapis-core) 18%) 0 55%, color-mix(in srgb, var(--color-ens-garnet-200), var(--color-ens-garnet-core) 18%) 55%)', // tile base (light tones nudged darker)
].join(', ')

// Rounded-square bead mask: a 5×4.5 tile holds a rounded rect (the bead); the
// transparent margin around it becomes the white gap between beads.
const BEAD_MASK =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='5' height='4.5'%3E%3Crect x='0.4' y='0.35' width='4.2' height='3.8' rx='1' fill='%23000'/%3E%3C/svg%3E\")"

/** Quilted bead-grid progress bar used by the renewing and success screens. */
export const BeadProgressBar = ({
  progress,
}: {
  readonly progress: number
}) => (
  <div className="h-[18px] w-full overflow-hidden rounded-md bg-ens-quartz-150">
    <div
      className="relative h-full bg-ens-quartz-0 transition-[width] duration-500 ease-out"
      style={{ width: `${Math.min(100, Math.max(4, progress))}%` }}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: COLOR_FIELD,
          maskImage: BEAD_MASK,
          maskSize: `${H_CELL}px ${V_CELL}px`,
          WebkitMaskImage: BEAD_MASK,
          WebkitMaskSize: `${H_CELL}px ${V_CELL}px`,
        }}
      />
    </div>
  </div>
)
