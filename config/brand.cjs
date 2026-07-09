const brandConfig = {
  themeColor: '#2C2F3B',
  backgroundColor: '#F4F7F6',
  sourceIconPng: 'assets/brand/app-icon.png',
  sourceIconIcns: 'assets/brand/app-icon.icns',
  smokeAttachment: 'scripts/fixtures/sample-attachment.svg',
  faviconIco: 'public/favicon.ico',
  browserIcons: [
    { path: 'public/favicon.png', size: 64 },
    { path: 'public/apple-touch-icon.png', size: 180 },
    { path: 'public/pwa-192.png', size: 192 },
    { path: 'public/pwa-512.png', size: 512 },
  ],
  pwaMaskableIcons: [
    { path: 'public/pwa-maskable-192.png', size: 192, innerSize: 161 },
    { path: 'public/pwa-maskable-512.png', size: 512, innerSize: 430 },
  ],
  manifestIcons: [
    { src: '/favicon.png', sizes: '64x64', type: 'image/png', purpose: 'any' },
    { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/pwa-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  androidLauncherIcons: [
    { density: 'mdpi', size: 48 },
    { density: 'hdpi', size: 72 },
    { density: 'xhdpi', size: 96 },
    { density: 'xxhdpi', size: 144 },
    { density: 'xxxhdpi', size: 192 },
  ],
  androidForegroundIcons: [
    { density: 'mdpi', size: 108, innerSize: 91 },
    { density: 'hdpi', size: 162, innerSize: 136 },
    { density: 'xhdpi', size: 216, innerSize: 181 },
    { density: 'xxhdpi', size: 324, innerSize: 272 },
    { density: 'xxxhdpi', size: 432, innerSize: 363 },
  ],
}

module.exports = {
  brandConfig,
}
