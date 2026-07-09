import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

const requiredText = [
  ['index.html', '/favicon.png'],
  ['index.html', '/favicon.ico'],
  ['index.html', '/apple-touch-icon.png'],
  ['index.html', 'content="#2C2F3B"'],
  ['vite.config.ts', '/favicon.png'],
  ['vite.config.ts', '/pwa-192.png'],
  ['vite.config.ts', '/pwa-512.png'],
  ['vite.config.ts', '/pwa-maskable-192.png'],
  ['vite.config.ts', '/pwa-maskable-512.png'],
  ['vite.config.ts', "theme_color: '#2C2F3B'"],
  ['android/app/src/main/res/values/ic_launcher_background.xml', '#2C2F3B'],
  ['android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', '@color/ic_launcher_background'],
  ['android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', '@mipmap/ic_launcher_foreground'],
  ['android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml', '@color/ic_launcher_background'],
  ['android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml', '@mipmap/ic_launcher_foreground'],
]

const forbiddenText = [
  ['index.html', 'favicon.svg'],
  ['vite.config.ts', 'favicon.svg'],
  ['scripts/smoke-local.mjs', 'public/favicon.svg'],
]

const requiredFiles = [
  'assets/brand/app-icon.icns',
  'assets/brand/app-icon.png',
  'public/favicon.ico',
  'scripts/fixtures/sample-attachment.svg',
]

const expectedPngSizes = [
  ['assets/brand/app-icon.png', 1024],
  ['public/favicon.png', 64],
  ['public/apple-touch-icon.png', 180],
  ['public/pwa-192.png', 192],
  ['public/pwa-512.png', 512],
  ['public/pwa-maskable-192.png', 192],
  ['public/pwa-maskable-512.png', 512],
  ['android/app/src/main/res/mipmap-mdpi/ic_launcher.png', 48],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher.png', 72],
  ['android/app/src/main/res/mipmap-xhdpi/ic_launcher.png', 96],
  ['android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png', 144],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', 192],
  ['android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png', 48],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png', 72],
  ['android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png', 96],
  ['android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png', 144],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png', 192],
  ['android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png', 108],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png', 162],
  ['android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png', 216],
  ['android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png', 324],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png', 432],
]

const absolute = (relativePath) => join(rootDir, relativePath)

const readText = (relativePath) => {
  const path = absolute(relativePath)

  if (!existsSync(path)) {
    failures.push(`Missing file: ${relativePath}`)
    return ''
  }

  return readFileSync(path, 'utf8')
}

const getPngSize = (relativePath) => {
  const path = absolute(relativePath)
  const result = spawnSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path], {
    encoding: 'utf8',
    stdio: 'pipe',
  })

  if (result.status !== 0) {
    failures.push(`Unable to read PNG dimensions: ${relativePath}`)
    return null
  }

  const width = result.stdout.match(/pixelWidth:\s*(\d+)/)?.[1]
  const height = result.stdout.match(/pixelHeight:\s*(\d+)/)?.[1]

  return width && height ? [Number(width), Number(height)] : null
}

for (const relativePath of requiredFiles) {
  if (!existsSync(absolute(relativePath))) {
    failures.push(`Missing file: ${relativePath}`)
  }
}

for (const [relativePath, needle] of requiredText) {
  const text = readText(relativePath)

  if (!text.includes(needle)) {
    failures.push(`${relativePath} should include ${needle}`)
  }
}

for (const [relativePath, needle] of forbiddenText) {
  const text = readText(relativePath)

  if (text.includes(needle)) {
    failures.push(`${relativePath} should not include ${needle}`)
  }
}

for (const [relativePath, expectedSize] of expectedPngSizes) {
  if (!existsSync(absolute(relativePath))) {
    failures.push(`Missing PNG: ${relativePath}`)
    continue
  }

  const size = getPngSize(relativePath)

  if (!size) continue

  const [width, height] = size
  if (width !== expectedSize || height !== expectedSize) {
    failures.push(`${relativePath} should be ${expectedSize}x${expectedSize}, got ${width}x${height}`)
  }
}

if (failures.length > 0) {
  console.error(`Asset verification failed with ${failures.length} issue(s):`)
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Asset verification passed.')
