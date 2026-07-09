const { app, BrowserWindow, shell } = require('electron')
const { appendFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

const apiHost = '127.0.0.1'
const apiPort = process.env.XINXIANGYI_API_PORT ?? '18787'
const apiBaseUrl = `http://${apiHost}:${apiPort}`

const getLogPath = () => {
  try {
    return join(app.getPath('userData'), 'electron-main.log')
  } catch {
    return join(tmpdir(), 'xinxiangyi-electron-main.log')
  }
}

const log = (message, detail) => {
  const suffix = detail == null ? '' : ` ${detail instanceof Error ? detail.stack ?? detail.message : JSON.stringify(detail)}`
  appendFileSync(getLogPath(), `[${new Date().toISOString()}] ${message}${suffix}\n`)
}

process.on('uncaughtException', (error) => {
  log('uncaughtException', error)
})

process.on('unhandledRejection', (error) => {
  log('unhandledRejection', error)
})

const gotLock = app.requestSingleInstanceLock()

const configureLocalApi = () => {
  const userDataDir = app.getPath('userData')

  process.env.XINXIANGYI_API_HOST = apiHost
  process.env.XINXIANGYI_API_PORT = apiPort
  process.env.XINXIANGYI_DATA_DIR = process.env.XINXIANGYI_DATA_DIR ?? join(userDataDir, 'data')
  process.env.XINXIANGYI_SYNC_BUNDLE_DIR = process.env.XINXIANGYI_SYNC_BUNDLE_DIR ?? join(userDataDir, 'sync')
}

const startLocalApi = async () => {
  configureLocalApi()
  log('starting local api', {
    apiBaseUrl,
    dataDir: process.env.XINXIANGYI_DATA_DIR,
    syncBundleDir: process.env.XINXIANGYI_SYNC_BUNDLE_DIR,
  })
  await import(pathToFileURL(join(__dirname, '..', 'server', 'local-api.mjs')).href)
  log('local api module loaded')
}

const createWindow = async () => {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 390,
    minHeight: 680,
    title: '心象仪',
    backgroundColor: '#f7f4ec',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, 'preload.cjs'),
      sandbox: false,
      additionalArguments: [`--xinxiangyi-api-base-url=${apiBaseUrl}`],
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
    return
  }

  await mainWindow.loadFile(join(app.getAppPath(), 'dist', 'index.html'))
}

if (!gotLock) {
  app.quit()
} else {
  app.whenReady().then(async () => {
    try {
      await startLocalApi()
      await createWindow()
      log('main window created')
    } catch (error) {
      log('startup failed', error)
      throw error
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow()
      }
    })
  })

  app.on('second-instance', () => {
    const [mainWindow] = BrowserWindow.getAllWindows()

    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
