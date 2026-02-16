// export {} makes this a module so augmentation merges instead of overwrites
export {}

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** Required: every route must declare whether it uses SidebarProvider */
    hasSidebar: boolean
  }
}
