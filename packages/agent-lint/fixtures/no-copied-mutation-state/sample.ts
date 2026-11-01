declare const useState: <T>(value: T) => readonly [T, (value: T) => void]
declare const saveMutation: { readonly isPending: boolean; readonly isSuccess: boolean }
export const view = () => {
  const busy = saveMutation.isPending // expect: no-copied-mutation-state
  const [done] = useState(saveMutation.isSuccess) // expect: no-copied-mutation-state
  const label = saveMutation.isPending ? 'saving' : 'idle'
  return [busy, done, label]
}
