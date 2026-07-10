const { contextBridge } = require('electron')
const { getLocalApiBaseUrl, localApiDefaults } = require('../config/local-api.cjs')

const apiBaseUrlArgument = process.argv.find((argument) => argument.startsWith('--xinxiangyi-api-base-url='))
const apiTokenArgument = process.argv.find((argument) => argument.startsWith('--xinxiangyi-api-token='))
const apiBaseUrl =
  apiBaseUrlArgument?.replace('--xinxiangyi-api-base-url=', '') ??
  getLocalApiBaseUrl({ port: localApiDefaults.desktopPort })
const apiToken = apiTokenArgument?.replace('--xinxiangyi-api-token=', '') ?? ''

contextBridge.exposeInMainWorld('xinxiangyiDesktop', {
  apiBaseUrl,
  apiToken,
})
