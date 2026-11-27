import type { HubApi } from '@shared/ipc'

declare global {
  interface Window {
    api: HubApi
  }
}
