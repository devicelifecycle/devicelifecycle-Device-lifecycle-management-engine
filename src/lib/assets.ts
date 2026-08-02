// ============================================================================
// CUSTOMER ASSET REGISTER — status model
// ============================================================================
// A customer's own device list: register a device, assign it to someone, move
// it, or retire it. Small status machine shared by the API and UI.

export const ASSET_STATUSES = ['registered', 'assigned', 'retired'] as const
export type AssetStatus = (typeof ASSET_STATUSES)[number]

const NEXT: Record<AssetStatus, AssetStatus[]> = {
  registered: ['assigned', 'retired'],
  assigned: ['registered', 'retired'], // unassign or retire
  retired: ['registered'],             // reactivate
}

export function canTransitionAsset(from: AssetStatus, to: AssetStatus): boolean {
  return NEXT[from]?.includes(to) ?? false
}

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  registered: 'Registered', assigned: 'Assigned', retired: 'Retired',
}
