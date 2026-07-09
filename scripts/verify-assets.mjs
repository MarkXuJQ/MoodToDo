import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { brandConfig } = require('../config/brand.cjs')
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

const requiredText = [
  ['index.html', '/favicon.png'],
  ['index.html', '/favicon.ico'],
  ['index.html', '/apple-touch-icon.png'],
  ['index.html', `content="${brandConfig.themeColor}"`],
  ['vite.config.ts', 'brandConfig.manifestIcons'],
  ['vite.config.ts', 'theme_color: brandConfig.themeColor'],
  ['vite.config.ts', 'background_color: brandConfig.backgroundColor'],
  ['android/app/src/main/res/values/ic_launcher_background.xml', brandConfig.themeColor],
  ['android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', '@color/ic_launcher_background'],
  ['android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', '@mipmap/ic_launcher_foreground'],
  ['android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml', '@color/ic_launcher_background'],
  ['android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml', '@mipmap/ic_launcher_foreground'],
  ...brandConfig.manifestIcons.map((icon) => ['config/brand.cjs', icon.src]),
]

const forbiddenText = [
  ['index.html', 'favicon.svg'],
  ['vite.config.ts', 'favicon.svg'],
  ['scripts/smoke-local.mjs', 'public/favicon.svg'],
]

const requiredFiles = [
  brandConfig.sourceIconIcns,
  brandConfig.sourceIconPng,
  brandConfig.faviconIco,
  brandConfig.smokeAttachment,
]

const expectedPngSizes = [
  [brandConfig.sourceIconPng, 1024],
  ...brandConfig.browserIcons.map((icon) => [icon.path, icon.size]),
  ...brandConfig.pwaMaskableIcons.map((icon) => [icon.path, icon.size]),
  ...brandConfig.androidLauncherIcons.flatMap((icon) => [
    [`android/app/src/main/res/mipmap-${icon.density}/ic_launcher.png`, icon.size],
    [`android/app/src/main/res/mipmap-${icon.density}/ic_launcher_round.png`, icon.size],
  ]),
  ...brandConfig.androidForegroundIcons.map((icon) => [
    `android/app/src/main/res/mipmap-${icon.density}/ic_launcher_foreground.png`,
    icon.size,
  ]),
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
