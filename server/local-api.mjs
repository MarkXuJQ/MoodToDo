import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = process.env.XINXIANGYI_DATA_DIR
  ? resolve(process.env.XINXIANGYI_DATA_DIR)
  : resolve(projectRoot, 'data')
const databaseName = 'xinxiangyi.sqlite'
const databasePath = resolve(dataDir, databaseName)
const syncDir = resolve(dataDir, '.sync')
const port = Number(process.env.XINXIANGYI_API_PORT ?? 8787)
const host = process.env.XINXIANGYI_API_HOST ?? '127.0.0.1'
const schemaVersion = 4

mkdirSync(dataDir, { recursive: true })
mkdirSync(syncDir, { recursive: true })

let db = new DatabaseSync(databasePath)

const configureDatabaseConnection = () => {
  db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = DELETE;
  PRAGMA synchronous = NORMAL;
  `)
}

configureDatabaseConnection()

db.exec(`

  CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    date_key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    mood_text TEXT NOT NULL,
    weather_text TEXT NOT NULL DEFAULT '',
    location_text TEXT NOT NULL DEFAULT '',
    mood_json TEXT NOT NULL,
    tags_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sync_state TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    date_key TEXT NOT NULL,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    sync_state TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    entry_id TEXT NOT NULL,
    date_key TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    size INTEGER NOT NULL,
    blob BLOB NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sync_state TEXT NOT NULL,
    FOREIGN KEY(entry_id) REFERENCES entries(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS changes (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    changed_at TEXT NOT NULL,
    device_id TEXT NOT NULL,
    sync_state TEXT NOT NULL,
    payload_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS weekly_summaries (
    week_key TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    model TEXT NOT NULL,
    provider TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS metric_definitions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    color TEXT NOT NULL,
    target_value REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sync_state TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS metric_records (
    id TEXT PRIMARY KEY,
    metric_id TEXT NOT NULL,
    date_key TEXT NOT NULL,
    value REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sync_state TEXT NOT NULL,
    UNIQUE(metric_id, date_key),
    FOREIGN KEY(metric_id) REFERENCES metric_definitions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_entries_date_key ON entries(date_key);
  CREATE INDEX IF NOT EXISTS idx_todos_date_key ON todos(date_key);
  CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos(created_at);
  CREATE INDEX IF NOT EXISTS idx_attachments_entry_id ON attachments(entry_id);
  CREATE INDEX IF NOT EXISTS idx_attachments_created_at ON attachments(created_at);
  CREATE INDEX IF NOT EXISTS idx_changes_changed_at ON changes(changed_at);
  CREATE INDEX IF NOT EXISTS idx_changes_sync_state ON changes(sync_state);
  CREATE INDEX IF NOT EXISTS idx_metric_records_metric_id ON metric_records(metric_id);
  CREATE INDEX IF NOT EXISTS idx_metric_records_date_key ON metric_records(date_key);
`)

const ensureColumn = (table, column, definition) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all()
  if (columns.some((item) => item.name === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
}

ensureColumn('entries', 'weather_text', `weather_text TEXT NOT NULL DEFAULT ''`)
ensureColumn('entries', 'location_text', `location_text TEXT NOT NULL DEFAULT ''`)

db.exec(`PRAGMA user_version = ${schemaVersion}`)

const nowIso = () => new Date().toISOString()

const createId = (prefix) => `${prefix}_${randomUUID()}`

const parseJson = (value, fallback) => {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

const getDeviceId = (request) => request.headers['x-xinxiangyi-device-id'] || 'local-api'

const rowToEntry = (row) => ({
  id: row.id,
  dateKey: row.date_key,
  title: row.title,
  body: row.body,
  moodText: row.mood_text,
  weatherText: row.weather_text ?? '',
  locationText: row.location_text ?? '',
  mood: parseJson(row.mood_json, {}),
  tags: parseJson(row.tags_json, []),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  syncState: row.sync_state,
})

const rowToTodo = (row) => ({
  id: row.id,
  dateKey: row.date_key,
  title: row.title,
  done: Boolean(row.done),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  completedAt: row.completed_at ?? undefined,
  syncState: row.sync_state,
})

const rowToAttachment = (row) => ({
  id: row.id,
  entryId: row.entry_id,
  dateKey: row.date_key,
  name: row.name,
  type: row.type,
  size: row.size,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  syncState: row.sync_state,
  dataBase64: Buffer.from(row.blob).toString('base64'),
})

const rowToChange = (row) => ({
  seq: Number(row.seq),
  entity: row.entity,
  entityId: row.entity_id,
  operation: row.operation,
  changedAt: row.changed_at,
  deviceId: row.device_id,
  syncState: row.sync_state,
  payload: parseJson(row.payload_json, null),
})

const rowToWeeklySummary = (row) => ({
  weekKey: row.week_key,
  content: row.content,
  model: row.model,
  provider: row.provider,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const rowToMetricDefinition = (row) => ({
  id: row.id,
  name: row.name,
  unit: row.unit,
  color: row.color,
  targetValue: row.target_value ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  syncState: row.sync_state,
})

const rowToMetricRecord = (row) => ({
  id: row.id,
  metricId: row.metric_id,
  dateKey: row.date_key,
  value: Number(row.value),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  syncState: row.sync_state,
})

const getMeta = () => ({
  driver: 'SQLite',
  databaseName,
  databasePath,
  apiBaseUrl: `http://${host}:${port}`,
  schemaVersion,
})

const quoteSqlString = (value) => `'${value.replaceAll("'", "''")}'`

const normalizeRemotePath = (value) => {
  const raw = typeof value === 'string' ? value.trim() : ''
  return raw || '/xinxiangyi'
}

const getWebDavConfig = (payload) => {
  const url = typeof payload.url === 'string' ? payload.url.trim() : ''
  const username = typeof payload.username === 'string' ? payload.username.trim() : ''
  const password = typeof payload.password === 'string' ? payload.password : ''
  const remotePath = normalizeRemotePath(payload.remotePath)

  if (!url) {
    throw new Error('请先配置 WebDAV Server URL。')
  }

  if (!username || !password) {
    throw new Error('请先配置 WebDAV 用户名和应用密码。')
  }

  try {
    new URL(url)
  } catch {
    throw new Error('WebDAV Server URL 不是合法地址。')
  }

  return {
    url,
    username,
    password,
    remotePath,
  }
}

const getWebDavHeaders = (config, contentType, extraHeaders = {}) => ({
  Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`,
  ...(contentType ? { 'Content-Type': contentType } : {}),
  ...extraHeaders,
})

const getRemoteSegments = (...parts) =>
  parts
    .flatMap((part) => String(part ?? '').split('/'))
    .map((part) => part.trim())
    .filter(Boolean)

const getWebDavUrl = (config, ...parts) => {
  const url = new URL(config.url)
  const basePath = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`
  const relativePath = getRemoteSegments(config.remotePath, ...parts)
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  url.pathname = `${basePath}${relativePath}`.replace(/\/{2,}/g, '/')
  url.search = ''
  url.hash = ''

  return url
}

const ensureWebDavCollection = async (config) => {
  const segments = getRemoteSegments(config.remotePath)

  for (let index = 0; index < segments.length; index += 1) {
    const url = getWebDavUrl({ ...config, remotePath: `/${segments.slice(0, index + 1).join('/')}` })
    const response = await fetch(url, {
      method: 'MKCOL',
      headers: getWebDavHeaders(config),
    })

    if (![200, 201, 204, 405].includes(response.status)) {
      const detail = await response.text().catch(() => '')
      throw new Error(`创建 WebDAV 目录失败：${response.status}${detail ? ` ${detail.slice(0, 180)}` : ''}`)
    }
  }
}

const createDatabaseSnapshot = () => {
  const snapshotPath = resolve(syncDir, `xinxiangyi-${Date.now()}.sqlite`)

  rmSync(snapshotPath, { force: true })
  db.exec(`VACUUM INTO ${quoteSqlString(snapshotPath)}`)

  return snapshotPath
}

const markLocalContentSynced = () => {
  transaction(() => {
    db.prepare(`UPDATE entries SET sync_state = 'synced' WHERE sync_state = 'pending'`).run()
    db.prepare(`UPDATE todos SET sync_state = 'synced' WHERE sync_state = 'pending'`).run()
    db.prepare(`UPDATE attachments SET sync_state = 'synced' WHERE sync_state = 'pending'`).run()
    db.prepare(`UPDATE metric_definitions SET sync_state = 'synced' WHERE sync_state = 'pending'`).run()
    db.prepare(`UPDATE metric_records SET sync_state = 'synced' WHERE sync_state = 'pending'`).run()
    db.prepare(`UPDATE changes SET sync_state = 'synced' WHERE sync_state = 'pending'`).run()
  })
}

const validateIncomingDatabase = (incomingPath) => {
  const incomingDb = new DatabaseSync(incomingPath, { readOnly: true })

  try {
    const integrity = incomingDb.prepare('PRAGMA integrity_check').get()
    const integrityValue = Object.values(integrity ?? {})[0]

    if (integrityValue !== 'ok') {
      throw new Error(`远端数据库完整性检查失败：${integrityValue}`)
    }

    const tables = incomingDb
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('entries', 'todos', 'attachments', 'changes')`)
      .all()

    if (tables.length < 4) {
      throw new Error('远端数据库不是有效的心象仪数据文件。')
    }
  } finally {
    incomingDb.close()
  }
}

const pushWebDavSnapshot = async (request, response) => {
  let config

  try {
    config = getWebDavConfig(await readJson(request))
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'WebDAV 配置无效。' })
    return
  }

  let snapshotPath = ''

  try {
    await ensureWebDavCollection(config)
    snapshotPath = createDatabaseSnapshot()

    const databaseUrl = getWebDavUrl(config, databaseName)
    const databaseBytes = readFileSync(snapshotPath)
    const uploadResponse = await fetch(databaseUrl, {
      method: 'PUT',
      headers: getWebDavHeaders(config, 'application/vnd.sqlite3'),
      body: databaseBytes,
    })

    if (!uploadResponse.ok) {
      const detail = await uploadResponse.text().catch(() => '')
      throw new Error(`上传 SQLite 快照失败：${uploadResponse.status}${detail ? ` ${detail.slice(0, 180)}` : ''}`)
    }

    const manifest = {
      app: 'xinxiangyi',
      databaseName,
      schemaVersion,
      pushedAt: nowIso(),
      size: statSync(snapshotPath).size,
    }
    const manifestResponse = await fetch(getWebDavUrl(config, 'manifest.json'), {
      method: 'PUT',
      headers: getWebDavHeaders(config, 'application/json; charset=utf-8'),
      body: JSON.stringify(manifest, null, 2),
    })

    if (!manifestResponse.ok) {
      const detail = await manifestResponse.text().catch(() => '')
      throw new Error(`上传同步清单失败：${manifestResponse.status}${detail ? ` ${detail.slice(0, 180)}` : ''}`)
    }

    markLocalContentSynced()

    sendJson(response, 200, {
      ok: true,
      direction: 'push',
      remotePath: config.remotePath,
      file: databaseName,
      size: manifest.size,
      syncedAt: manifest.pushedAt,
    })
  } catch (error) {
    sendJson(response, 502, { error: error instanceof Error ? error.message : 'WebDAV Push 失败。' })
  } finally {
    if (snapshotPath) {
      rmSync(snapshotPath, { force: true })
    }
  }
}

const pullWebDavSnapshot = async (request, response) => {
  let config

  try {
    config = getWebDavConfig(await readJson(request))
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'WebDAV 配置无效。' })
    return
  }

  const incomingPath = resolve(syncDir, `incoming-${Date.now()}.sqlite`)
  const backupPath = resolve(syncDir, `local-backup-${Date.now()}.sqlite`)

  try {
    const remoteResponse = await fetch(getWebDavUrl(config, databaseName), {
      method: 'GET',
      headers: getWebDavHeaders(config),
    })

    if (!remoteResponse.ok) {
      const detail = await remoteResponse.text().catch(() => '')
      throw new Error(`下载远端 SQLite 快照失败：${remoteResponse.status}${detail ? ` ${detail.slice(0, 180)}` : ''}`)
    }

    writeFileSync(incomingPath, Buffer.from(await remoteResponse.arrayBuffer()))
    validateIncomingDatabase(incomingPath)

    if (existsSync(databasePath)) {
      copyFileSync(databasePath, backupPath)
    }

    db.close()

    try {
      copyFileSync(incomingPath, databasePath)
      db = new DatabaseSync(databasePath)
      configureDatabaseConnection()
      ensureColumn('entries', 'weather_text', `weather_text TEXT NOT NULL DEFAULT ''`)
      ensureColumn('entries', 'location_text', `location_text TEXT NOT NULL DEFAULT ''`)
      db.exec(`PRAGMA user_version = ${schemaVersion}`)
    } catch (error) {
      if (existsSync(backupPath)) {
        copyFileSync(backupPath, databasePath)
      }
      db = new DatabaseSync(databasePath)
      configureDatabaseConnection()
      throw error
    }

    sendJson(response, 200, {
      ok: true,
      direction: 'pull',
      remotePath: config.remotePath,
      file: databaseName,
      size: statSync(databasePath).size,
      backupPath: existsSync(backupPath) ? backupPath : '',
      syncedAt: nowIso(),
    })
  } catch (error) {
    sendJson(response, 502, { error: error instanceof Error ? error.message : 'WebDAV Pull 失败。' })
  } finally {
    rmSync(incomingPath, { force: true })
  }
}

const testWebDavConnection = async (request, response) => {
  let config

  try {
    config = getWebDavConfig(await readJson(request))
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'WebDAV 配置无效。' })
    return
  }

  const checkedAt = nowIso()
  const targetUrl = getWebDavUrl(config)

  try {
    const probeResponse = await fetch(targetUrl, {
      method: 'PROPFIND',
      headers: getWebDavHeaders(config, undefined, {
        Accept: 'application/xml, text/xml, */*',
        Depth: '0',
      }),
    })

    if (probeResponse.status === 401 || probeResponse.status === 403) {
      sendJson(response, 200, {
        ok: false,
        pathExists: false,
        writable: false,
        status: probeResponse.status,
        remotePath: config.remotePath,
        checkedAt,
        message: 'WebDAV 已响应，但账号或应用密码没有通过验证。',
      })
      return
    }

    if (probeResponse.status === 404) {
      sendJson(response, 200, {
        ok: true,
        pathExists: false,
        writable: false,
        status: probeResponse.status,
        remotePath: config.remotePath,
        checkedAt,
        message: 'WebDAV 连接成功，但远端目录不存在。首次上传同步时会尝试自动创建该目录。',
      })
      return
    }

    if (![200, 207].includes(probeResponse.status)) {
      const detail = await probeResponse.text().catch(() => '')
      sendJson(response, 200, {
        ok: false,
        pathExists: false,
        writable: false,
        status: probeResponse.status,
        remotePath: config.remotePath,
        checkedAt,
        message: `WebDAV 目录探测失败：${probeResponse.status}${detail ? ` ${detail.slice(0, 160)}` : ''}`,
      })
      return
    }

    const testFile = `.xinxiangyi-webdav-test-${Date.now()}.txt`
    const writeResponse = await fetch(getWebDavUrl(config, testFile), {
      method: 'PUT',
      headers: getWebDavHeaders(config, 'text/plain; charset=utf-8'),
      body: `xinxiangyi webdav test ${checkedAt}\n`,
    })

    if (!writeResponse.ok) {
      const detail = await writeResponse.text().catch(() => '')
      sendJson(response, 200, {
        ok: false,
        pathExists: true,
        writable: false,
        status: writeResponse.status,
        remotePath: config.remotePath,
        checkedAt,
        message: `WebDAV 目录可访问，但测试写入失败：${writeResponse.status}${detail ? ` ${detail.slice(0, 160)}` : ''}`,
      })
      return
    }

    await fetch(getWebDavUrl(config, testFile), {
      method: 'DELETE',
      headers: getWebDavHeaders(config),
    }).catch(() => undefined)

    sendJson(response, 200, {
      ok: true,
      pathExists: true,
      writable: true,
      status: writeResponse.status,
      remotePath: config.remotePath,
      checkedAt,
      message: 'WebDAV 连接成功，目录存在，并且测试写入通过。',
    })
  } catch (error) {
    sendJson(response, 502, { error: error instanceof Error ? error.message : 'WebDAV 连接测试失败。' })
  }
}

const normalizeChatCompletionsEndpoint = (value) => {
  const raw = typeof value === 'string' ? value.trim() : ''

  if (!raw) {
    throw new Error('请先配置大模型 Endpoint。')
  }

  let url

  try {
    url = new URL(raw)
  } catch {
    throw new Error('Endpoint 不是合法的 URL。请填写完整的 http(s) 地址。')
  }

  const normalizedPath = url.pathname.replace(/\/+$/, '')

  if (
    normalizedPath === '' ||
    normalizedPath === '/' ||
    normalizedPath === '/v1' ||
    normalizedPath.startsWith('/docs')
  ) {
    url.pathname = '/v1/chat/completions'
    url.search = ''
    return url.toString()
  }

  if (normalizedPath.endsWith('/chat/completions')) {
    url.pathname = normalizedPath
    return url.toString()
  }

  if (normalizedPath.endsWith('/responses')) {
    throw new Error('当前周总结只支持 Chat Completions 兼容接口，请填写 /v1/chat/completions 或可自动补全的基础网关地址。')
  }

  return url.toString()
}

const extractAiContent = (payload) => {
  if (payload?.error?.message) {
    throw new Error(payload.error.message)
  }

  return payload?.choices?.[0]?.message?.content ?? payload?.output_text ?? ''
}

const requestWeeklySummary = async (request, response) => {
  const payload = await readJson(request)
  let endpoint = ''
  const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : ''
  const model = typeof payload.model === 'string' ? payload.model.trim() : ''
  const messages = Array.isArray(payload.messages) ? payload.messages : []
  const temperature = typeof payload.temperature === 'number' ? payload.temperature : 0.4

  try {
    endpoint = normalizeChatCompletionsEndpoint(payload.endpoint)
  } catch (error) {
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : 'Endpoint 配置无效。',
    })
    return
  }

  if (!apiKey) {
    sendJson(response, 400, { error: '请先配置大模型 API Key。' })
    return
  }

  if (!model) {
    sendJson(response, 400, { error: '请先配置模型名称。' })
    return
  }

  if (messages.length === 0) {
    sendJson(response, 400, { error: '本次总结没有可发送的消息内容。' })
    return
  }

  let upstreamResponse

  try {
    upstreamResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
      }),
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : '未知网络错误。'
    sendJson(response, 502, {
      error: `本地代理无法连接到上游模型接口。请检查 Endpoint、网络、HTTPS 证书或代理设置。原始错误：${detail}`,
    })
    return
  }

  const responseText = await upstreamResponse.text()
  let upstreamPayload = {}

  try {
    upstreamPayload = responseText ? JSON.parse(responseText) : {}
  } catch {
    upstreamPayload = {}
  }

  try {
    const content = extractAiContent(upstreamPayload).trim()

    if (!upstreamResponse.ok) {
      throw new Error(content || `请求失败：${upstreamResponse.status}`)
    }

    if (!content) {
      throw new Error(responseText || '模型没有返回可用内容。')
    }

    sendJson(response, 200, {
      content,
      model,
      resolvedEndpoint: endpoint,
    })
  } catch (error) {
    sendJson(response, upstreamResponse.ok ? 502 : upstreamResponse.status, {
      error: error instanceof Error ? error.message : '生成周总结失败。',
      upstreamStatus: upstreamResponse.status,
    })
  }
}

const appendChange = (entity, entityId, operation, payload, deviceId) => {
  db.prepare(`
    INSERT INTO changes (entity, entity_id, operation, changed_at, device_id, sync_state, payload_json)
    VALUES ($entity, $entityId, $operation, $changedAt, $deviceId, 'pending', $payloadJson)
  `).run({
    $entity: entity,
    $entityId: entityId,
    $operation: operation,
    $changedAt: nowIso(),
    $deviceId: deviceId,
    $payloadJson: JSON.stringify(payload),
  })
}

const transaction = (callback) => {
  db.exec('BEGIN IMMEDIATE')

  try {
    const result = callback()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

const readRequestBody = async (request, maxBytes = 80 * 1024 * 1024) => {
  const chunks = []
  let size = 0

  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBytes) {
      throw new Error('请求体过大。请先压缩图片，或等待附件分片同步版本。')
    }
    chunks.push(chunk)
  }

  return Buffer.concat(chunks).toString('utf8')
}

const readJson = async (request) => {
  const raw = await readRequestBody(request)

  return raw ? JSON.parse(raw) : {}
}

const sendJson = (response, status, payload) => {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Xinxiangyi-Device-Id',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

const notFound = (response) => sendJson(response, 404, { error: 'API route not found.' })

const getState = () => ({
  entries: db.prepare('SELECT * FROM entries ORDER BY date_key DESC').all().map(rowToEntry),
  todos: db.prepare('SELECT * FROM todos ORDER BY created_at DESC').all().map(rowToTodo),
  attachments: db.prepare('SELECT * FROM attachments ORDER BY created_at DESC').all().map(rowToAttachment),
  metricDefinitions: db
    .prepare('SELECT * FROM metric_definitions ORDER BY created_at ASC')
    .all()
    .map(rowToMetricDefinition),
  metricRecords: db
    .prepare('SELECT * FROM metric_records ORDER BY date_key DESC, updated_at DESC')
    .all()
    .map(rowToMetricRecord),
  changes: db.prepare('SELECT * FROM changes ORDER BY changed_at DESC').all().map(rowToChange),
  weeklySummaries: db
    .prepare('SELECT * FROM weekly_summaries ORDER BY updated_at DESC')
    .all()
    .map(rowToWeeklySummary),
  meta: getMeta(),
})

const upsertEntry = async (request, response) => {
  const payload = await readJson(request)
  const { draft, mood, files = [] } = payload
  const timestamp = nowIso()
  const existing = db.prepare('SELECT * FROM entries WHERE date_key = ?').get(draft.dateKey)
  const entry = {
    id: existing?.id ?? createId('entry'),
    dateKey: draft.dateKey,
    title: draft.title,
    body: draft.body,
    moodText: draft.moodText,
    weatherText: draft.weatherText ?? existing?.weather_text ?? '',
    locationText: draft.locationText ?? existing?.location_text ?? '',
    mood,
    tags: draft.tags,
    createdAt: existing?.created_at ?? timestamp,
    updatedAt: timestamp,
    syncState: 'pending',
  }
  const deviceId = getDeviceId(request)

  transaction(() => {
    db.prepare(`
      INSERT INTO entries (
        id, date_key, title, body, mood_text, weather_text, location_text, mood_json, tags_json, created_at, updated_at, sync_state
      )
      VALUES (
        $id, $dateKey, $title, $body, $moodText, $weatherText, $locationText, $moodJson, $tagsJson, $createdAt, $updatedAt, $syncState
      )
      ON CONFLICT(id) DO UPDATE SET
        date_key = excluded.date_key,
        title = excluded.title,
        body = excluded.body,
        mood_text = excluded.mood_text,
        weather_text = excluded.weather_text,
        location_text = excluded.location_text,
        mood_json = excluded.mood_json,
        tags_json = excluded.tags_json,
        updated_at = excluded.updated_at,
        sync_state = excluded.sync_state
    `).run({
      $id: entry.id,
      $dateKey: entry.dateKey,
      $title: entry.title,
      $body: entry.body,
      $moodText: entry.moodText,
      $weatherText: entry.weatherText,
      $locationText: entry.locationText,
      $moodJson: JSON.stringify(entry.mood),
      $tagsJson: JSON.stringify(entry.tags),
      $createdAt: entry.createdAt,
      $updatedAt: entry.updatedAt,
      $syncState: entry.syncState,
    })
    appendChange('entry', entry.id, 'upsert', entry, deviceId)

    for (const file of files) {
      const attachment = {
        id: createId('attachment'),
        entryId: entry.id,
        dateKey: entry.dateKey,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        createdAt: timestamp,
        updatedAt: timestamp,
        syncState: 'pending',
      }

      db.prepare(`
        INSERT INTO attachments (
          id, entry_id, date_key, name, type, size, blob, created_at, updated_at, sync_state
        )
        VALUES (
          $id, $entryId, $dateKey, $name, $type, $size, $blob, $createdAt, $updatedAt, $syncState
        )
      `).run({
        $id: attachment.id,
        $entryId: attachment.entryId,
        $dateKey: attachment.dateKey,
        $name: attachment.name,
        $type: attachment.type,
        $size: attachment.size,
        $blob: Buffer.from(file.dataBase64, 'base64'),
        $createdAt: attachment.createdAt,
        $updatedAt: attachment.updatedAt,
        $syncState: attachment.syncState,
      })
      appendChange(
        'attachment',
        attachment.id,
        'upsert',
        {
          ...attachment,
          blob: {
            type: attachment.type,
            size: attachment.size,
          },
        },
        deviceId,
      )
    }
  })

  sendJson(response, 200, { entry })
}

const deleteEntryRows = (entryRows, deviceId) => {
  for (const row of entryRows) {
    const entry = rowToEntry(row)
    const attachmentsForEntry = db.prepare('SELECT * FROM attachments WHERE entry_id = ?').all(entry.id).map(rowToAttachment)

    db.prepare('DELETE FROM entries WHERE id = ?').run(entry.id)

    for (const attachment of attachmentsForEntry) {
      appendChange(
        'attachment',
        attachment.id,
        'delete',
        {
          id: attachment.id,
          entryId: attachment.entryId,
          dateKey: attachment.dateKey,
          name: attachment.name,
        },
        deviceId,
      )
    }

    appendChange('entry', entry.id, 'delete', entry, deviceId)
  }
}

const deleteEntry = async (request, response, id) => {
  const existing = db.prepare('SELECT * FROM entries WHERE id = ?').get(id)

  if (!existing) {
    sendJson(response, 404, { error: 'Journal entry not found.' })
    return
  }

  const deviceId = getDeviceId(request)

  transaction(() => {
    deleteEntryRows([existing], deviceId)
  })

  sendJson(response, 200, { ok: true })
}

const deleteEntriesBatch = async (request, response) => {
  const payload = await readJson(request)
  const ids = Array.isArray(payload.ids)
    ? [...new Set(payload.ids.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean))]
    : []

  if (ids.length === 0) {
    sendJson(response, 400, { error: '请选择至少一条日记记录。' })
    return
  }

  const placeholders = ids.map(() => '?').join(', ')
  const entryRows = db.prepare(`SELECT * FROM entries WHERE id IN (${placeholders})`).all(...ids)

  if (entryRows.length === 0) {
    sendJson(response, 404, { error: '没有找到可删除的日记记录。' })
    return
  }

  const deviceId = getDeviceId(request)

  transaction(() => {
    deleteEntryRows(entryRows, deviceId)
  })

  sendJson(response, 200, { ok: true, deletedCount: entryRows.length })
}

const addTodo = async (request, response) => {
  const payload = await readJson(request)
  const timestamp = nowIso()
  const todo = {
    id: createId('todo'),
    dateKey: payload.dateKey,
    title: payload.title,
    done: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncState: 'pending',
  }
  const deviceId = getDeviceId(request)

  transaction(() => {
    db.prepare(`
      INSERT INTO todos (id, date_key, title, done, created_at, updated_at, sync_state)
      VALUES ($id, $dateKey, $title, 0, $createdAt, $updatedAt, $syncState)
    `).run({
      $id: todo.id,
      $dateKey: todo.dateKey,
      $title: todo.title,
      $createdAt: todo.createdAt,
      $updatedAt: todo.updatedAt,
      $syncState: todo.syncState,
    })
    appendChange('todo', todo.id, 'upsert', todo, deviceId)
  })

  sendJson(response, 200, { todo })
}

const updateTodo = async (request, response, id) => {
  const payload = await readJson(request)
  const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(id)

  if (!existing) {
    sendJson(response, 404, { error: 'Todo not found.' })
    return
  }

  const timestamp = nowIso()
  const todo = {
    ...rowToTodo(existing),
    done: Boolean(payload.done),
    completedAt: payload.done ? timestamp : undefined,
    updatedAt: timestamp,
    syncState: 'pending',
  }
  const deviceId = getDeviceId(request)

  transaction(() => {
    db.prepare(`
      UPDATE todos
      SET done = $done, completed_at = $completedAt, updated_at = $updatedAt, sync_state = 'pending'
      WHERE id = $id
    `).run({
      $id: todo.id,
      $done: todo.done ? 1 : 0,
      $completedAt: todo.completedAt ?? null,
      $updatedAt: todo.updatedAt,
    })
    appendChange('todo', todo.id, 'upsert', todo, deviceId)
  })

  sendJson(response, 200, { todo })
}

const deleteTodo = async (request, response, id) => {
  const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(id)

  if (!existing) {
    sendJson(response, 404, { error: 'Todo not found.' })
    return
  }

  const todo = rowToTodo(existing)
  const deviceId = getDeviceId(request)

  transaction(() => {
    db.prepare('DELETE FROM todos WHERE id = ?').run(id)
    appendChange('todo', todo.id, 'delete', todo, deviceId)
  })

  sendJson(response, 200, { ok: true })
}

const deleteAttachment = async (request, response, id) => {
  const existing = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id)

  if (!existing) {
    sendJson(response, 404, { error: 'Attachment not found.' })
    return
  }

  const attachment = rowToAttachment(existing)
  const deviceId = getDeviceId(request)

  transaction(() => {
    db.prepare('DELETE FROM attachments WHERE id = ?').run(id)
    appendChange(
      'attachment',
      attachment.id,
      'delete',
      {
        id: attachment.id,
        entryId: attachment.entryId,
        dateKey: attachment.dateKey,
        name: attachment.name,
      },
      deviceId,
    )
  })

  sendJson(response, 200, { ok: true })
}

const upsertWeeklySummary = async (request, response) => {
  const payload = await readJson(request)
  const timestamp = nowIso()
  const existing = db.prepare('SELECT * FROM weekly_summaries WHERE week_key = ?').get(payload.weekKey)
  const summary = {
    weekKey: payload.weekKey,
    content: payload.content,
    model: payload.model,
    provider: payload.provider ?? 'openai-compatible',
    createdAt: existing?.created_at ?? timestamp,
    updatedAt: timestamp,
  }

  db.prepare(`
    INSERT INTO weekly_summaries (week_key, content, model, provider, created_at, updated_at)
    VALUES ($weekKey, $content, $model, $provider, $createdAt, $updatedAt)
    ON CONFLICT(week_key) DO UPDATE SET
      content = excluded.content,
      model = excluded.model,
      provider = excluded.provider,
      updated_at = excluded.updated_at
  `).run({
    $weekKey: summary.weekKey,
    $content: summary.content,
    $model: summary.model,
    $provider: summary.provider,
    $createdAt: summary.createdAt,
    $updatedAt: summary.updatedAt,
  })

  sendJson(response, 200, { summary })
}

const upsertMetricDefinition = async (request, response) => {
  const payload = await readJson(request)
  const timestamp = nowIso()
  const existing = payload.id ? db.prepare('SELECT * FROM metric_definitions WHERE id = ?').get(payload.id) : null
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  const unit = typeof payload.unit === 'string' ? payload.unit.trim() : ''
  const color = typeof payload.color === 'string' ? payload.color.trim() : ''
  const targetValue =
    typeof payload.targetValue === 'number' && Number.isFinite(payload.targetValue) ? payload.targetValue : null

  if (!name) {
    sendJson(response, 400, { error: '指标名称不能为空。' })
    return
  }

  if (!/^#([0-9a-fA-F]{6})$/.test(color)) {
    sendJson(response, 400, { error: '请使用合法的颜色值。' })
    return
  }

  const metricDefinition = {
    id: existing?.id ?? createId('metric'),
    name,
    unit,
    color,
    targetValue: targetValue ?? undefined,
    createdAt: existing?.created_at ?? timestamp,
    updatedAt: timestamp,
    syncState: 'pending',
  }
  const deviceId = getDeviceId(request)

  transaction(() => {
    db.prepare(`
      INSERT INTO metric_definitions (
        id, name, unit, color, target_value, created_at, updated_at, sync_state
      )
      VALUES (
        $id, $name, $unit, $color, $targetValue, $createdAt, $updatedAt, $syncState
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        unit = excluded.unit,
        color = excluded.color,
        target_value = excluded.target_value,
        updated_at = excluded.updated_at,
        sync_state = excluded.sync_state
    `).run({
      $id: metricDefinition.id,
      $name: metricDefinition.name,
      $unit: metricDefinition.unit,
      $color: metricDefinition.color,
      $targetValue: metricDefinition.targetValue ?? null,
      $createdAt: metricDefinition.createdAt,
      $updatedAt: metricDefinition.updatedAt,
      $syncState: metricDefinition.syncState,
    })
    appendChange('metricDefinition', metricDefinition.id, 'upsert', metricDefinition, deviceId)
  })

  sendJson(response, 200, { metricDefinition })
}

const upsertMetricRecord = async (request, response) => {
  const payload = await readJson(request)
  const timestamp = nowIso()
  const metricId = typeof payload.metricId === 'string' ? payload.metricId.trim() : ''
  const dateKey = typeof payload.dateKey === 'string' ? payload.dateKey.trim() : ''
  const value = Number(payload.value)

  if (!metricId || !dateKey || !Number.isFinite(value)) {
    sendJson(response, 400, { error: '指标记录缺少有效的日期或数值。' })
    return
  }

  const definition = db.prepare('SELECT * FROM metric_definitions WHERE id = ?').get(metricId)

  if (!definition) {
    sendJson(response, 404, { error: '指标不存在。' })
    return
  }

  const existing = db.prepare('SELECT * FROM metric_records WHERE metric_id = ? AND date_key = ?').get(metricId, dateKey)
  const metricRecord = {
    id: existing?.id ?? createId('metric_record'),
    metricId,
    dateKey,
    value,
    createdAt: existing?.created_at ?? timestamp,
    updatedAt: timestamp,
    syncState: 'pending',
  }
  const deviceId = getDeviceId(request)

  transaction(() => {
    db.prepare(`
      INSERT INTO metric_records (
        id, metric_id, date_key, value, created_at, updated_at, sync_state
      )
      VALUES (
        $id, $metricId, $dateKey, $value, $createdAt, $updatedAt, $syncState
      )
      ON CONFLICT(metric_id, date_key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at,
        sync_state = excluded.sync_state
    `).run({
      $id: metricRecord.id,
      $metricId: metricRecord.metricId,
      $dateKey: metricRecord.dateKey,
      $value: metricRecord.value,
      $createdAt: metricRecord.createdAt,
      $updatedAt: metricRecord.updatedAt,
      $syncState: metricRecord.syncState,
    })
    appendChange('metricRecord', metricRecord.id, 'upsert', metricRecord, deviceId)
  })

  sendJson(response, 200, { metricRecord })
}

const deleteMetricDefinition = async (request, response, id) => {
  const existing = db.prepare('SELECT * FROM metric_definitions WHERE id = ?').get(id)

  if (!existing) {
    sendJson(response, 404, { error: '指标不存在。' })
    return
  }

  const metricDefinition = rowToMetricDefinition(existing)
  const deviceId = getDeviceId(request)

  transaction(() => {
    db.prepare('DELETE FROM metric_definitions WHERE id = ?').run(id)
    appendChange('metricDefinition', metricDefinition.id, 'delete', metricDefinition, deviceId)
  })

  sendJson(response, 200, { ok: true })
}

const route = async (request, response) => {
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {})
    return
  }

  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`)
  const pathname = url.pathname

  if (request.method === 'GET' && pathname === '/api/health') {
    sendJson(response, 200, { ok: true, meta: getMeta() })
    return
  }

  if (request.method === 'GET' && pathname === '/api/state') {
    sendJson(response, 200, getState())
    return
  }

  if (request.method === 'POST' && pathname === '/api/ai/weekly-summary') {
    await requestWeeklySummary(request, response)
    return
  }

  if (request.method === 'POST' && pathname === '/api/webdav/push') {
    await pushWebDavSnapshot(request, response)
    return
  }

  if (request.method === 'POST' && pathname === '/api/webdav/pull') {
    await pullWebDavSnapshot(request, response)
    return
  }

  if (request.method === 'POST' && pathname === '/api/webdav/test') {
    await testWebDavConnection(request, response)
    return
  }

  if (request.method === 'POST' && pathname === '/api/entries/upsert') {
    await upsertEntry(request, response)
    return
  }

  if (request.method === 'POST' && pathname === '/api/entries/batch-delete') {
    await deleteEntriesBatch(request, response)
    return
  }

  const entryMatch = pathname.match(/^\/api\/entries\/([^/]+)$/)
  if (entryMatch && request.method === 'DELETE') {
    await deleteEntry(request, response, decodeURIComponent(entryMatch[1]))
    return
  }

  if (request.method === 'POST' && pathname === '/api/todos') {
    await addTodo(request, response)
    return
  }

  const todoMatch = pathname.match(/^\/api\/todos\/([^/]+)$/)
  if (todoMatch && request.method === 'PATCH') {
    await updateTodo(request, response, decodeURIComponent(todoMatch[1]))
    return
  }

  if (todoMatch && request.method === 'DELETE') {
    await deleteTodo(request, response, decodeURIComponent(todoMatch[1]))
    return
  }

  const attachmentMatch = pathname.match(/^\/api\/attachments\/([^/]+)$/)
  if (attachmentMatch && request.method === 'DELETE') {
    await deleteAttachment(request, response, decodeURIComponent(attachmentMatch[1]))
    return
  }

  if (request.method === 'POST' && pathname === '/api/summaries/upsert') {
    await upsertWeeklySummary(request, response)
    return
  }

  if (request.method === 'POST' && pathname === '/api/metrics/definitions/upsert') {
    await upsertMetricDefinition(request, response)
    return
  }

  if (request.method === 'POST' && pathname === '/api/metrics/records/upsert') {
    await upsertMetricRecord(request, response)
    return
  }

  const metricDefinitionMatch = pathname.match(/^\/api\/metrics\/definitions\/([^/]+)$/)
  if (metricDefinitionMatch && request.method === 'DELETE') {
    await deleteMetricDefinition(request, response, decodeURIComponent(metricDefinitionMatch[1]))
    return
  }

  notFound(response)
}

const server = createServer((request, response) => {
  route(request, response).catch((error) => {
    console.error(error)
    sendJson(response, 500, { error: error instanceof Error ? error.message : 'Local API failed.' })
  })
})

server.listen(port, host, () => {
  console.log(`Xinxiangyi SQLite API listening on http://${host}:${port}`)
  console.log(`Database: ${databasePath}`)
})

const shutdown = () => {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
