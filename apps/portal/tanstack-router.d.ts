// export {} makes this a module so augmentation merges instead of overwrites
export {}

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** Set to true for routes without SidebarProvider (/, /register). Defaults to false. */
    hideSidebar?: boolean
  }
}
