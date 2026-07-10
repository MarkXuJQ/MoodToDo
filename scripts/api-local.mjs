import { randomUUID } from 'node:crypto'

process.env.XINXIANGYI_API_TOKEN = process.env.XINXIANGYI_API_TOKEN ?? randomUUID()

await import('../server/local-api.mjs')
