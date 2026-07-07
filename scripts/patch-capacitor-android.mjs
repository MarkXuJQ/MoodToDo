import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const systemBarsPath = resolve(
  'node_modules',
  '@capacitor',
  'android',
  'capacitor',
  'src',
  'main',
  'java',
  'com',
  'getcapacitor',
  'plugin',
  'SystemBars.java',
)

if (!existsSync(systemBarsPath)) {
  console.warn('Capacitor Android SystemBars.java not found; skipping local SDK compatibility patch.')
  process.exit(0)
}

const source = readFileSync(systemBarsPath, 'utf8')
const patched = source.replaceAll('Build.VERSION_CODES.VANILLA_ICE_CREAM', '35')

if (patched !== source) {
  writeFileSync(systemBarsPath, patched)
  console.log('Patched Capacitor Android SystemBars.java for local Android SDK 34 builds.')
}
