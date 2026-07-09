const localApiDefaults = {
  host: '127.0.0.1',
  browserPort: '8787',
  desktopPort: '18787',
}

const getLocalApiBaseUrl = ({ host = localApiDefaults.host, port = localApiDefaults.browserPort } = {}) =>
  `http://${host}:${port}`

module.exports = {
  getLocalApiBaseUrl,
  localApiDefaults,
}
