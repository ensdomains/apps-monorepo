/**
 * Shared striping + hover classes for table rows, so every table stays
 * consistent and the look can be tuned in one place.
 *
 * - **Striped**: odd rows carry a subtle tint and clear to white on hover;
 *   even (white) rows pick up the tint on hover — so every row reacts visibly.
 * - **Unstriped**: every row lifts to the subtle tint on hover.
 *
 * The tint is the existing `sidebar` token at `/60` opacity (composited toward
 * the row background). Tune the opacity here for a lighter/stronger tint.
 */
export const stripedRowClassName = (striped: boolean): string =>
  striped
    ? 'odd:bg-sidebar/80 odd:hover:bg-background even:hover:bg-sidebar/80'
    : 'hover:bg-muted'
