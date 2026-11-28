import { app, BrowserWindow } from 'electron'
import { registerIpc } from './ipc'
import { recoverInterruptedRuns, stopAllRunsSync } from './runs/runner'
import { loadSettings } from './settings'
import { createMainWindow } from './window'

// Applies the stored theme before any window exists, so there is no flash of the wrong theme.
loadSettings()

app.whenReady().then(() => {
  registerIpc()
  createMainWindow()
  recoverInterruptedRuns().catch((error: unknown) =>
    console.error('Failed to recover interrupted runs', error),
  )

  // macOS: re-create a window when the dock icon is clicked and none are open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

// Agent processes must not outlive the app. Their runs are marked as stopped on next start.
app.on('before-quit', () => stopAllRunsSync())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
