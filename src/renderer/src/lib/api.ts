import type { HubApi } from '@shared/ipc'

/** Typed access to the main process. The only bridge between renderer and main. */
export const api: HubApi = window.api
