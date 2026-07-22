export type MigrationSuccessShareUrls = {
  readonly x?: string
  readonly telegram?: string
  readonly discord?: string
  readonly copy?: string
}

export type MigrationSuccessDialogState =
  | {
      readonly status: 'rendering'
    }
  | {
      readonly status: 'ready'
      readonly artworkUrl: string
      readonly migratedAt: Date
      readonly migratedNameCount: number
      readonly shareUrls?: MigrationSuccessShareUrls
      readonly marketplaceUrl?: string
    }
