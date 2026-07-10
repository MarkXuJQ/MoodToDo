import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

process.env.XINXIANGYI_API_TOKEN = process.env.XINXIANGYI_API_TOKEN ?? randomUUID()

const children = []

const run = (name, command, args) => {
  const child = spawn(command, args, {
    env: process.env,
    stdio: 'inherit',
  })

  children.push(child)

  child.on('exit', (code, signal) => {
    if (signal) return
    if (code === 0) return

    console.error(`${name} exited with code ${code}`)
    shutdown(code ?? 1)
  })

  return child
}

const shutdown = (code = 0) => {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
  }

  process.exit(code)
}

const viteArgs = process.argv.slice(2)

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

run('SQLite API', process.execPath, ['--disable-warning=ExperimentalWarning', 'server/local-api.mjs'])
run('Vite', process.execPath, ['node_modules/vite/bin/vite.js', ...viteArgs])
