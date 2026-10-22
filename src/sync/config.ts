/**
 * Where the sync server lives. These values are public by design: the
 * publishable key only allows calling the three sync functions, and every
 * record is encrypted before it leaves the device.
 * Override with VITE_SYNC_URL and VITE_SYNC_KEY when building.
 */
export const SYNC_URL: string = import.meta.env.VITE_SYNC_URL ?? '';
export const SYNC_KEY: string = import.meta.env.VITE_SYNC_KEY ?? '';
