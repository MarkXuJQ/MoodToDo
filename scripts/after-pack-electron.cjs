const { readdirSync, rmSync, statSync } = require('node:fs')
const { join } = require('node:path')

const keptLocaleDirs = new Set(['Base.lproj', 'en.lproj', 'zh_CN.lproj'])

const removeUnusedLocaleDirs = (root) => {
  let removed = 0

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)

    if (entry.isDirectory()) {
      if (entry.name.endsWith('.lproj') && !keptLocaleDirs.has(entry.name)) {
        const size = statSync(path).size
        rmSync(path, { recursive: true, force: true })
        removed += size
        continue
      }

      removed += removeUnusedLocaleDirs(path)
    }
  }

  return removed
}

module.exports = async (context) => {
  if (context.electronPlatformName !== 'darwin') return

  removeUnusedLocaleDirs(context.appOutDir)
}
