import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { brandConfig } = require('../config/brand.cjs')
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceIcon = join(rootDir, brandConfig.sourceIconPng)
const launcherBackgroundHex = brandConfig.themeColor.replace('#', '')

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: 'pipe',
  })

  if (result.status === 0) return

  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  throw new Error(`${command} ${args.join(' ')} failed${output ? `:\n${output}` : ''}`)
}

const ensureFile = (path) => {
  if (!existsSync(path)) {
    throw new Error(`Missing source file: ${path}`)
  }
}

const ensureParentDir = (path) => {
  mkdirSync(dirname(path), { recursive: true })
}

const resize = (input, size, output) => {
  ensureParentDir(output)
  run('sips', ['-z', String(size), String(size), input, '--out', output])
}

const pad = (input, size, output) => {
  ensureParentDir(output)
  run('sips', ['-p', String(size), String(size), '--padColor', launcherBackgroundHex, input, '--out', output])
}

const convertToIco = (input, output) => {
  ensureParentDir(output)
  run('sips', ['-s', 'format', 'ico', input, '--out', output])
}

const writeAndroidLauncherBackground = () => {
  const output = join(rootDir, 'android/app/src/main/res/values/ic_launcher_background.xml')
  ensureParentDir(output)
  writeFileSync(
    output,
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${brandConfig.themeColor}</color>\n</resources>\n`,
  )
}

const tempDir = mkdtempSync(join(tmpdir(), 'xinxiangyi-icons-'))

try {
  ensureFile(sourceIcon)

  for (const { path, size } of brandConfig.browserIcons) {
    resize(sourceIcon, size, join(rootDir, path))
  }

  convertToIco(join(rootDir, 'public/favicon.png'), join(rootDir, brandConfig.faviconIco))

  for (const { path, size, innerSize } of brandConfig.pwaMaskableIcons) {
    const inner = join(tempDir, `${path.replaceAll('/', '-')}-inner.png`)
    resize(sourceIcon, innerSize, inner)
    pad(inner, size, join(rootDir, path))
  }

  for (const { density, size } of brandConfig.androidLauncherIcons) {
    const directory = join(rootDir, `android/app/src/main/res/mipmap-${density}`)
    resize(sourceIcon, size, join(directory, 'ic_launcher.png'))
    resize(sourceIcon, size, join(directory, 'ic_launcher_round.png'))
  }

  for (const { density, size, innerSize } of brandConfig.androidForegroundIcons) {
    const inner = join(tempDir, `ic_launcher_foreground_${density}_inner.png`)
    resize(sourceIcon, innerSize, inner)
    pad(inner, size, join(rootDir, `android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`))
  }

  writeAndroidLauncherBackground()

  console.log(`Synced app icons from ${brandConfig.sourceIconPng}`)
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
