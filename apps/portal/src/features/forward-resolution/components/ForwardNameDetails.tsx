import type { ForwardName } from './ForwardNamesTable/columns'

export const ForwardNameDetails = ({ name }: { name: ForwardName }) => {
  return <div>{name.name}</div>
}
