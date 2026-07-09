import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceIcon = join(rootDir, 'assets/brand/app-icon.png')
const launcherBackground = '2C2F3B'

const webIcons = [
  ['public/favicon.png', 64],
  ['public/apple-touch-icon.png', 180],
  ['public/pwa-192.png', 192],
  ['public/pwa-512.png', 512],
]

const pwaMaskableIcons = [
  ['public/pwa-maskable-192.png', 192, 161],
  ['public/pwa-maskable-512.png', 512, 430],
]

const androidLauncherIcons = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
]

const androidForegroundIcons = [
  ['mdpi', 108, 91],
  ['hdpi', 162, 136],
  ['xhdpi', 216, 181],
  ['xxhdpi', 324, 272],
  ['xxxhdpi', 432, 363],
]

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
  run('sips', ['-p', String(size), String(size), '--padColor', launcherBackground, input, '--out', output])
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
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#${launcherBackground}</color>\n</resources>\n`,
  )
}

const tempDir = mkdtempSync(join(tmpdir(), 'xinxiangyi-icons-'))

try {
  ensureFile(sourceIcon)

  for (const [relativeOutput, size] of webIcons) {
    resize(sourceIcon, size, join(rootDir, relativeOutput))
  }

  convertToIco(join(rootDir, 'public/favicon.png'), join(rootDir, 'public/favicon.ico'))

  for (const [relativeOutput, canvasSize, iconSize] of pwaMaskableIcons) {
    const inner = join(tempDir, `${relativeOutput.replaceAll('/', '-')}-inner.png`)
    resize(sourceIcon, iconSize, inner)
    pad(inner, canvasSize, join(rootDir, relativeOutput))
  }

  for (const [density, size] of androidLauncherIcons) {
    const directory = join(rootDir, `android/app/src/main/res/mipmap-${density}`)
    resize(sourceIcon, size, join(directory, 'ic_launcher.png'))
    resize(sourceIcon, size, join(directory, 'ic_launcher_round.png'))
  }

  for (const [density, canvasSize, iconSize] of androidForegroundIcons) {
    const inner = join(tempDir, `ic_launcher_foreground_${density}_inner.png`)
    resize(sourceIcon, iconSize, inner)
    pad(inner, canvasSize, join(rootDir, `android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`))
  }

  writeAndroidLauncherBackground()

  console.log('Synced app icons from assets/brand/app-icon.png')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
