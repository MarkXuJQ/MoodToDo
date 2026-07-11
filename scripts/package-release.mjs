import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = require('../package.json')
const version = pkg.version
const productName = pkg.build?.productName ?? '心象仪'
const releaseDir = join(rootDir, pkg.build?.directories?.output ?? 'release')

const run = (label, command, args, options = {}) => {
  console.log(`\n› ${label}`)

  const result = spawnSync(command, args, {
    cwd: options.cwd ?? rootDir,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: 'inherit',
  })

  if (result.status === 0) return

  throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}.`)
}

const runNpm = (script) => {
  run(`npm run ${script}`, 'npm', ['run', script])
}

const assertFile = (path) => {
  if (!existsSync(path)) {
    throw new Error(`Expected release artifact was not found: ${path}`)
  }
}

const sizeInMiB = (path) => (statSync(path).size / 1024 / 1024).toFixed(1)

const copyAndroidApk = () => {
  const source = join(rootDir, 'android/app/build/outputs/apk/debug/app-debug.apk')
  const target = join(releaseDir, `${productName}-${version}-android-debug.apk`)

  assertFile(source)
  mkdirSync(releaseDir, { recursive: true })
  copyFileSync(source, target)

  return target
}

const writeReleaseNotes = (artifacts) => {
  const notesPath = join(releaseDir, `${productName}-${version}-release-notes.md`)
  const lines = [
    `# ${productName} v${version}`,
    '',
    '本版本是 v1.0.1 修正版发行包，用于替换上一轮未完整处理成长游戏同步数据的 v1.0.1 产物。',
    '',
    '## 主要内容',
    '',
    '- 成长页继续沿用像素风格游戏视口，并支持按屏幕尺寸自适应。',
    '- WebDAV 快照现在包含成长游戏存档：植物布局、金币、融合次数、仓库和图谱状态会随云端同步。',
    '- 云端同步保护逻辑改为双向恢复：普通合并同步仍会暂停，但确认云端正确时可以从云端恢复并解除本机保护标记。',
    '- macOS 使用 Electron DMG 包。',
    '- Android 使用本地可安装 debug APK；如需正式上架包，需要后续补充签名配置。',
    '',
    '## 产物',
    '',
    ...artifacts.map((artifact) => `- ${basename(artifact)} (${sizeInMiB(artifact)} MiB)`),
    '',
    '## 本地验证',
    '',
    '- npm run lint',
    '- npm run build',
    '- npm run verify:assets',
    '- npm run smoke:local',
    '- Android Gradle assembleDebug',
    '- electron-builder mac dmg',
  ]

  writeFileSync(notesPath, `${lines.join('\n')}\n`)

  return notesPath
}

const main = () => {
  console.log(`${productName} v${version} release packaging`)
  console.log('Existing release artifacts are kept; this script does not clean the release directory.')

  runNpm('lint')
  runNpm('build')
  runNpm('verify:assets')
  runNpm('smoke:local')
  runNpm('cap:sync:only')
  runNpm('android:apk:only')
  runNpm('mac:dmg:only')

  const dmgPath = join(releaseDir, `${productName}-${version}-arm64.dmg`)
  const blockmapPath = `${dmgPath}.blockmap`
  const androidApkPath = copyAndroidApk()

  assertFile(dmgPath)
  assertFile(blockmapPath)

  const notesPath = writeReleaseNotes([dmgPath, blockmapPath, androidApkPath])

  console.log('\nRelease artifacts ready:')
  for (const artifact of [dmgPath, blockmapPath, androidApkPath, notesPath]) {
    console.log(`- ${artifact}`)
  }
}

try {
  main()
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
