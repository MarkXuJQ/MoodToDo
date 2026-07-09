const { contextBridge } = require('electron')
const { getLocalApiBaseUrl, localApiDefaults } = require('../config/local-api.cjs')

const apiBaseUrlArgument = process.argv.find((argument) => argument.startsWith('--xinxiangyi-api-base-url='))
const apiBaseUrl =
  apiBaseUrlArgument?.replace('--xinxiangyi-api-base-url=', '') ??
  getLocalApiBaseUrl({ port: localApiDefaults.desktopPort })

contextBridge.exposeInMainWorld('xinxiangyiDesktop', {
  apiBaseUrl,
})
