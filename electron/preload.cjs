const { contextBridge } = require('electron')

const apiBaseUrlArgument = process.argv.find((argument) => argument.startsWith('--xinxiangyi-api-base-url='))
const apiBaseUrl = apiBaseUrlArgument?.replace('--xinxiangyi-api-base-url=', '') ?? 'http://127.0.0.1:8787'

contextBridge.exposeInMainWorld('xinxiangyiDesktop', {
  apiBaseUrl,
})
