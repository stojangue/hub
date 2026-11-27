import { app, BrowserWindow, nativeTheme } from 'electron'
import { registerIpc } from './ipc'
import { createMainWindow } from './window'

// Dark appearance for now; a theme setting will replace this later.
// Drives both the native window chrome and `prefers-color-scheme` in the renderer.
nativeTheme.themeSource = 'dark'

app.whenReady().then(() => {
  registerIpc()
  createMainWindow()

  // macOS: re-create a window when the dock icon is clicked and none are open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
