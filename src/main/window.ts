import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'
import { windowBackgroundColor } from './settings'

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    show: false,
    titleBarStyle: 'hiddenInset',
    // Vertically centred in the 52px titlebar (`--spacing-titlebar`), on the same axis as the
    // sidebar toggle and the breadcrumbs. Keep in sync with `--spacing-traffic-lights` in globals.css.
    trafficLightPosition: { x: 20, y: 19 },
    // Matches `--color-background` in globals.css, so the window does not flash on open.
    backgroundColor: windowBackgroundColor(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })

  window.once('ready-to-show', () => window.show())

  // Open external links in the default browser, never inside the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Block navigation away from the app's own content.
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault()
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}
