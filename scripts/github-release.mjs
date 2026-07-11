import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = require('../package.json')
const version = pkg.version
const productName = pkg.build?.productName ?? '心象仪'
const releaseDir = join(rootDir, pkg.build?.directories?.output ?? 'release')
const tag = `v${version}`
const title = `${productName} ${tag}`
const notesPath = join(releaseDir, `${productName}-${version}-release-notes.md`)
const artifacts = [
  join(releaseDir, `${productName}-${version}-arm64.dmg`),
  join(releaseDir, `${productName}-${version}-arm64.dmg.blockmap`),
  join(releaseDir, `${productName}-${version}-android-debug.apk`),
]

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: options.encoding ?? 'utf8',
    stdio: options.stdio ?? 'pipe',
  })

  if (options.allowFailure || result.status === 0) return result

  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  throw new Error(`${command} ${args.join(' ')} failed${output ? `:\n${output}` : ''}`)
}

const main = () => {
  for (const path of [...artifacts, notesPath]) {
    if (!existsSync(path)) {
      throw new Error(`Missing release file: ${path}\nRun npm run package:release first.`)
    }
  }

  run('gh', ['auth', 'status'], { stdio: 'inherit' })

  const dirty = run('git', ['status', '--porcelain']).stdout.trim()
  if (dirty && process.env.XINXIANGYI_ALLOW_DIRTY_RELEASE !== '1') {
    throw new Error(
      'The working tree has uncommitted changes. Commit them before publishing so the GitHub release tag matches the packaged app, or set XINXIANGYI_ALLOW_DIRTY_RELEASE=1 if you intentionally want to publish assets only.',
    )
  }

  const branch = run('git', ['branch', '--show-current']).stdout.trim() || 'HEAD'
  const existingRelease = run('gh', ['release', 'view', tag], { allowFailure: true })
  const artifactNames = artifacts.map((artifact) => basename(artifact)).join(', ')

  if (existingRelease.status === 0) {
    console.log(`Release ${tag} already exists; uploading artifacts with --clobber: ${artifactNames}`)
    run('gh', ['release', 'upload', tag, ...artifacts, '--clobber'], { stdio: 'inherit' })
  } else {
    console.log(`Creating GitHub release ${tag} from ${branch}: ${artifactNames}`)
    run(
      'gh',
      ['release', 'create', tag, ...artifacts, '--target', branch, '--title', title, '--notes-file', notesPath],
      { stdio: 'inherit' },
    )
  }
}

try {
  main()
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
