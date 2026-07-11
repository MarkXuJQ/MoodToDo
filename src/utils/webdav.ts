import type { WebDavSyncResult } from '../lib/db'
import { formatBytes } from './format'

export const formatWebDavSyncMessage = (result: WebDavSyncResult) => {
  const action = result.direction === 'pull' ? '已从云端拉取' : '已上传本机快照'
  const migration = result.migratedFile ? `；旧库已迁移为 ${result.migratedFile}` : ''
  const growthGame = result.growthGameSave ? '；含成长存档' : ''

  return `${action} ${result.file} · ${formatBytes(result.size)}${growthGame}${migration}`
}

export const isMissingRemoteSnapshotMessage = (message: string) =>
  /远端目录|同步快照不存在|远端同步快照不存在|ObjectNotFound|AncestorsNotFound|404|409|not found/i.test(message)
