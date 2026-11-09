export const shouldConfirmRecordNavigation = ({
  changesCount,
  currentPathname,
  nextPathname,
}: {
  readonly changesCount: number
  readonly currentPathname: string
  readonly nextPathname: string
}) => changesCount > 0 && currentPathname !== nextPathname
