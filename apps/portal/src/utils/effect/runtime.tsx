import { ManagedRuntime } from 'effect'
import React from 'react'
import { LiveLayer, type LiveManagedRuntime } from './liveLayer'

export const runtime = ManagedRuntime.make(LiveLayer)

export type RuntimeContext =
  ManagedRuntime.ManagedRuntime.Context<LiveManagedRuntime>
export const RuntimeContext = React.createContext<LiveManagedRuntime | null>(
  null,
)

// NOTE: Unused but could be used to provide the runtime via the react context tree. In our use cases it'll probably be better to use the runtime directly via imports.
// export const RuntimeProvider: React.FC<{
//   children: React.ReactNode
//   runtime: LiveManagedRuntime
// }> = ({ children, runtime }) => {
//   const mountRef = React.useRef(false)

//   React.useEffect(() => {
//     if (!mountRef.current) {
//       mountRef.current = true
//       return
//     }

//     return () => {
//       runtime.dispose()
//     }
//   }, [runtime])

//   return (
//     <RuntimeContext.Provider value={runtime}>
//       {children}
//     </RuntimeContext.Provider>
//   )
// }

// export const useRuntime = (): LiveManagedRuntime => {
//   const runtime = React.useContext(RuntimeContext)
//   if (runtime === null)
//     throw new Error('useRuntime must be used within an AppRuntimeProvider')
//   return runtime
// }
