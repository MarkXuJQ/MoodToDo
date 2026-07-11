import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { chromium } from 'playwright-core'

const projectRoot = new URL('..', import.meta.url).pathname
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const tempRoot = await mkdtemp(join(tmpdir(), 'xinxiangyi-smoke-'))
const dataDir = join(tempRoot, 'data')
const syncBundleDir = join(tempRoot, 'sync')
const apiToken = randomUUID()
const children = []

const formatLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const todayKey = formatLocalDateKey()

const findFreePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()

      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('无法分配隔离测试端口。'))
        return
      }

      const { port } = address
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })

const [apiPort, webPort] = await Promise.all([findFreePort(), findFreePort()])
const origin = `http://127.0.0.1:${webPort}`
const apiBaseUrl = `http://127.0.0.1:${apiPort}`
const baseEnv = {
  ...process.env,
  XINXIANGYI_API_HOST: '127.0.0.1',
  XINXIANGYI_API_PORT: String(apiPort),
  XINXIANGYI_API_TOKEN: apiToken,
  XINXIANGYI_ALLOWED_ORIGINS: origin,
  XINXIANGYI_DATA_DIR: dataDir,
  XINXIANGYI_SYNC_BUNDLE_DIR: syncBundleDir,
}

const spawnChild = (command, args) => {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: baseEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(child)

  return child
}

const waitForUrl = async (url, init = {}, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs
  let lastError

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, init)
      if (response.ok) return response
      lastError = new Error(`${url} 返回 ${response.status}`)
    } catch (error) {
      lastError = error
    }

    await new Promise((resolve) => setTimeout(resolve, 120))
  }

  throw lastError ?? new Error(`${url} 未就绪。`)
}

const apiFetch = (path, init = {}) =>
  fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Xinxiangyi-API-Token': apiToken,
      'X-Xinxiangyi-Device-Id': 'isolated-smoke',
      ...init.headers,
    },
  })

const getJson = async (path) => {
  const response = await apiFetch(path)
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error ?? `${path} 返回 ${response.status}`)

  return payload
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const assertNoGrowthPageScroll = async (page, label) => {
  const metrics = await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    const viewportHeight = Math.round(window.visualViewport?.height ?? window.innerHeight)
    const documentElement = document.scrollingElement ?? document.documentElement
    const toMetrics = (selector) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)

      return {
        clientHeight: Math.ceil(element.clientHeight),
        scrollHeight: Math.ceil(element.scrollHeight),
        rectHeight: Math.ceil(rect.height),
        overflowY: style.overflowY,
      }
    }

    return {
      viewportHeight,
      document: {
        clientHeight: Math.ceil(documentElement.clientHeight),
        scrollHeight: Math.ceil(documentElement.scrollHeight),
      },
      shell: toMetrics('.shell-growth'),
      appShell: toMetrics('.app-shell-growth'),
      contentShell: toMetrics('.app-shell-growth .content-shell'),
      gamePage: toMetrics('.garden-page-game'),
    }
  })

  const documentOverflow = metrics.document.scrollHeight - metrics.document.clientHeight
  assert(documentOverflow <= 2, `${label} 成长页产生了文档滚动：${JSON.stringify(metrics)}`)
  assert(metrics.shell?.overflowY === 'hidden', `${label} 成长页外壳没有禁用滚动。`)
  assert(metrics.contentShell?.overflowY === 'hidden', `${label} 成长页内容容器没有禁用滚动。`)
  assert((metrics.gamePage?.rectHeight ?? 0) <= metrics.viewportHeight + 2, `${label} 成长页画面高度超过视口。`)
}

const getExpectedHeatColor = (score) => {
  if (score < 35) return 'rgb(255, 242, 168)'
  if (score < 50) return 'rgb(244, 211, 94)'
  if (score < 66) return 'rgb(155, 233, 168)'
  if (score < 82) return 'rgb(64, 196, 99)'

  return 'rgb(33, 110, 57)'
}

spawnChild(process.execPath, [
  '--disable-warning=ExperimentalWarning',
  'server/local-api.mjs',
])
spawnChild(process.execPath, [
  'node_modules/vite/bin/vite.js',
  '--host',
  '127.0.0.1',
  '--port',
  String(webPort),
  '--strictPort',
])

let browser

try {
  await waitForUrl(`${apiBaseUrl}/api/health`, {
    headers: { 'X-Xinxiangyi-API-Token': apiToken },
  })
  await waitForUrl(origin)

  const unauthenticated = await fetch(`${apiBaseUrl}/api/state`)
  assert(unauthenticated.status === 401, '未提供 API token 时必须返回 401。')

  const hostileOrigin = await fetch(`${apiBaseUrl}/api/state`, {
    headers: {
      Origin: 'https://hostile.example',
      'X-Xinxiangyi-API-Token': apiToken,
    },
  })
  assert(hostileOrigin.ok, '合法 token 的状态请求应成功。')
  assert(
    hostileOrigin.headers.get('access-control-allow-origin') == null,
    '非白名单 Origin 不应收到跨域许可。',
  )

  await writeFile(join(dataDir, '.sync', 'webdav-recovery-required'), '')
  const blockedSync = await apiFetch('/api/webdav/push', {
    method: 'POST',
    body: JSON.stringify({
      url: 'http://127.0.0.1:1/',
      username: 'isolated',
      password: 'isolated',
      remotePath: '/isolated-smoke',
    }),
  })
  assert(blockedSync.status === 409, '恢复标记存在时，普通 WebDAV 合并同步必须被阻止。')

  const allowedRecoveryAttempt = await apiFetch('/api/webdav/pull', {
    method: 'POST',
    body: JSON.stringify({
      url: 'http://127.0.0.1:1/',
      username: 'isolated',
      password: 'isolated',
      remotePath: '/isolated-smoke',
      allowRecoveryPull: true,
    }),
  })
  assert(allowedRecoveryAttempt.status !== 409, '明确从云端恢复时不应被保护标记拦截。')

  const growthSyncSave = {
    version: 1,
    coins: 777,
    seedBoxes: [],
    plants: [
      {
        id: 'sync-growth-a',
        family: 'sun',
        stage: 2,
        placement: 'board',
        cellIndex: 4,
        sourceDateKey: todayKey,
        sourceMoodScore: 72,
        sourceQuadrant: '高能舒展',
        createdAt: new Date().toISOString(),
      },
    ],
    grantedRewardKeys: ['sync-growth'],
    discoveredCodexIds: ['sun-2'],
    unlockedCells: 24,
    storageLimit: 12,
    lastCollectedAt: new Date().toISOString(),
    lifetimeCoins: 888,
    mergeCount: 1,
    nextPlantSerial: 9,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const bundleResponse = await apiFetch('/api/sync-bundle/export', {
    method: 'POST',
    body: JSON.stringify({ growthGameSave: growthSyncSave }),
  })
  assert(bundleResponse.ok, '生成本地同步包失败。')
  const bundleSnapshot = JSON.parse(
    await readFile(join(syncBundleDir, 'xinxiangyi-sync', 'xinxiangyi-native-snapshot.json'), 'utf8'),
  )
  assert(bundleSnapshot.growthGame?.coins === 777, 'WebDAV 同步包没有写入成长金币。')
  assert(bundleSnapshot.growthGame?.plants?.[0]?.cellIndex === 4, 'WebDAV 同步包没有写入植物布局。')

  const initialState = await getJson('/api/state')
  assert(!('entries' in initialState), '/api/state 不应再返回日记正文。')
  assert(!('todos' in initialState), '/api/state 不应再返回 Todo 列表。')
  assert(!('attachments' in initialState), '/api/state 不应再返回附件列表或正文。')
  assert(initialState.meta.webDavRecoveryRequired, '状态接口没有返回云端恢复保护标记。')

  const suffix = Date.now()
  const title = `隔离日记 ${suffix}`
  const updatedTitle = `花园日记 ${suffix}`
  const todoTitle = `隔离 Todo ${suffix}`
  const journalText =
    '今天上午买菜、做饭并整理了书架，下午开会讨论需求，这些只是普通记录。工作压力很大，我有些焦虑和疲惫，不过我意识到先休息和散步会帮助恢复，明天准备调整节奏。'
  const mood = {
    score: 60,
    level: '平稳',
    quadrant: '高能舒展',
    confidence: 1,
    algorithm: 'isolated-smoke',
    signals: { clarity: 0, load: 0, energy: 0, recovery: 0, reflection: 0 },
    vector: { valence: 0, arousal: 0, resilience: 0, clarity: 0 },
    keywords: [],
    reviewHint: '',
  }
  const onePixelPng =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zf6sAAAAASUVORK5CYII='
  const entryResponse = await apiFetch('/api/entries/upsert', {
    method: 'POST',
    body: JSON.stringify({
      draft: {
        dateKey: todayKey,
        title,
        body: '仅存在于一次性测试数据库。',
        moodText: '平稳',
        tags: ['隔离测试'],
      },
      mood,
      files: [
        {
          name: 'isolated.png',
          type: 'image/png',
          size: Buffer.from(onePixelPng, 'base64').length,
          dataBase64: onePixelPng,
        },
      ],
    }),
  })
  const entryMutation = await entryResponse.json()
  assert(entryResponse.ok, entryMutation.error ?? '隔离日记写入失败。')
  assert(entryMutation.attachments.length === 1, '日记写入结果应包含新附件元数据。')

  const entriesPage = await getJson('/api/entries?offset=0&limit=1')
  assert(entriesPage.total === 1 && entriesPage.items[0].title === title, '日记分页返回异常。')
  assert(!entriesPage.hasMore, '单条日记不应报告下一页。')

  const attachmentsPage = await getJson(
    `/api/attachments?entryId=${encodeURIComponent(entryMutation.entry.id)}&offset=0&limit=1`,
  )
  assert(attachmentsPage.total === 1, '附件分页返回异常。')
  assert(!('dataBase64' in attachmentsPage.items[0]), '附件列表不得包含 Base64 正文。')
  assert(!('blob' in attachmentsPage.items[0]), '附件列表不得包含二进制正文。')

  const attachmentContent = await apiFetch(
    `/api/attachments/${encodeURIComponent(attachmentsPage.items[0].id)}/content`,
  )
  assert(attachmentContent.ok, '附件正文按需读取失败。')
  assert((await attachmentContent.arrayBuffer()).byteLength > 0, '附件正文为空。')

  const todoResponse = await apiFetch('/api/todos', {
    method: 'POST',
    body: JSON.stringify({ dateKey: todayKey, title: todoTitle }),
  })
  const todoMutation = await todoResponse.json()
  assert(todoResponse.ok, todoMutation.error ?? '隔离 Todo 写入失败。')

  const secondTodoTitle = `分页 Todo ${suffix}`
  const secondTodoResponse = await apiFetch('/api/todos', {
    method: 'POST',
    body: JSON.stringify({ dateKey: formatLocalDateKey(new Date(Date.now() + 86_400_000)), title: secondTodoTitle }),
  })
  assert(secondTodoResponse.ok, '第二条隔离 Todo 写入失败。')

  const todoPage = await getJson('/api/todos?offset=0&limit=1')
  assert(todoPage.total === 2 && todoPage.items.length === 1, 'Todo 分页大小异常。')
  assert(todoPage.hasMore, 'Todo 分页应报告还有下一页。')

  browser = await chromium.launch({ headless: true, executablePath: chromePath })
  const context = await browser.newContext()
  await context.addInitScript(() => {
    const now = new Date().toISOString()

    window.localStorage.setItem(
      'xinxiangyi-webdav-config-v1',
      JSON.stringify({
        url: 'not-a-valid-webdav-url',
        username: 'isolated',
        password: 'isolated',
        remotePath: '/isolated-smoke',
        autoSyncDaily: false,
      }),
    )
    window.localStorage.setItem(
      'xinxiangyi-growth-game-v1',
      JSON.stringify({
        version: 1,
        coins: 0,
        seedBoxes: [],
        plants: [
          {
            id: 'merge-smoke-a',
            family: 'dew',
            stage: 1,
            placement: 'board',
            cellIndex: 6,
            sourceDateKey: '2026-07-01',
            sourceMoodScore: 62,
            sourceQuadrant: '低能修复',
            createdAt: now,
          },
          {
            id: 'merge-smoke-b',
            family: 'dew',
            stage: 1,
            placement: 'board',
            cellIndex: 7,
            sourceDateKey: '2026-07-02',
            sourceMoodScore: 64,
            sourceQuadrant: '低能修复',
            createdAt: now,
          },
          {
            id: 'merge-smoke-c',
            family: 'dew',
            stage: 1,
            placement: 'board',
            cellIndex: 10,
            sourceDateKey: '2026-07-03',
            sourceMoodScore: 66,
            sourceQuadrant: '低能修复',
            createdAt: now,
          },
          {
            id: 'merge-smoke-d',
            family: 'moon',
            stage: 1,
            placement: 'board',
            cellIndex: 18,
            sourceDateKey: '2026-07-04',
            sourceMoodScore: 48,
            sourceQuadrant: '低能承压',
            createdAt: now,
          },
          {
            id: 'merge-smoke-e',
            family: 'moon',
            stage: 1,
            placement: 'board',
            cellIndex: 19,
            sourceDateKey: '2026-07-05',
            sourceMoodScore: 46,
            sourceQuadrant: '低能承压',
            createdAt: now,
          },
          {
            id: 'merge-smoke-f',
            family: 'moon',
            stage: 1,
            placement: 'board',
            cellIndex: 20,
            sourceDateKey: '2026-07-06',
            sourceMoodScore: 44,
            sourceQuadrant: '低能承压',
            createdAt: now,
          },
        ],
        grantedRewardKeys: ['merge-smoke'],
        discoveredCodexIds: ['dew-1', 'moon-1'],
        unlockedCells: 24,
        storageLimit: 12,
        lastCollectedAt: now,
        lifetimeCoins: 0,
        mergeCount: 0,
        nextPlantSerial: 20,
        createdAt: now,
        updatedAt: now,
      }),
    )
  })
  const page = await context.newPage()
  const browserErrors = []
  const attachmentContentUrls = []
  page.on('request', (request) => {
    if (request.url().includes('/api/attachments/') && request.url().endsWith('/content')) {
      attachmentContentUrls.push(request.url())
    }
  })
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  await page.goto(origin, { waitUntil: 'networkidle' })

  try {
    await page.getByAltText('isolated.png').waitFor({ state: 'visible', timeout: 5_000 })
  } catch (error) {
    console.error('SMOKE_DEBUG_PAGE', (await page.locator('body').innerText()).slice(0, 4_000))
    console.error('SMOKE_DEBUG_URLS', attachmentContentUrls)
    console.error('SMOKE_DEBUG_ERRORS', browserErrors)
    throw error
  }
  assert(
    attachmentContentUrls.some((url) =>
      url.includes(`/api/attachments/${attachmentsPage.items[0].id}/content`),
    ),
    '已保存附件没有通过独立正文接口懒加载。',
  )

  const journalInput = page.getByRole('textbox', { name: '日记' })
  await journalInput.fill(journalText)
  await page.getByRole('textbox', { name: '标题' }).fill(updatedTitle)
  const moodPreview = page.locator('.journal-mood-preview')
  await moodPreview.waitFor({ state: 'visible' })
  assert((await moodPreview.innerText()).includes('预计心象'), '日记输入没有实时心象预估。')

  const saveResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/api/entries/upsert') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const saveResponse = await saveResponsePromise
  assert(saveResponse.ok(), `通过界面保存日记失败：${saveResponse.status()}`)
  await page.getByText('日记已保存', { exact: true }).waitFor({ state: 'visible' })

  const updatedEntriesPage = await getJson('/api/entries?offset=0&limit=2')
  assert(updatedEntriesPage.total === 1, '修改当日日记后不应新增第二条记录。')
  assert(updatedEntriesPage.items[0].title === updatedTitle, '界面保存后的日记标题不正确。')
  assert(updatedEntriesPage.items[0].body === journalText, '完整日记正文没有原样保存。')
  assert(updatedEntriesPage.items[0].moodText === '', '新日记不应再单独保存心情描述。')
  assert(
    updatedEntriesPage.items[0].mood.algorithm === 'xinxiang-v0.3-journal-vector',
    '保存后的心象分没有使用日记向量算法。',
  )
  assert(updatedEntriesPage.items[0].mood.keywords.includes('压力'), '心象算法没有从完整日记提取压力线索。')
  assert(updatedEntriesPage.items[0].mood.keywords.includes('恢复'), '心象算法没有从完整日记提取恢复线索。')

  await page.getByRole('button', { name: '成长', exact: true }).click()
  await page.getByRole('grid', { name: '心象森林棋盘', exact: true }).waitFor({ state: 'visible' })
  assert((await page.getByRole('heading', { name: '心象森林', exact: true }).count()) === 0, '成长页不应再显示左上角标题牌。')
  assert(await page.locator('.nav-drawer').isVisible(), '宽屏成长页应保留左侧导航。')
  assert((await page.locator('.bottom-nav').count()) === 0, '宽屏成长页不应显示底部导航。')
  assert((await page.locator('.garden-overlay-hud').innerText()).includes('金币'), '成长页 HUD 没有显示金币。')
  assert((await page.locator('.garden-overlay-hud').innerText()).includes('菜单'), '成长页 HUD 没有收起游戏菜单入口。')
  await assertNoGrowthPageScroll(page, '桌面宽屏')
  assert((await page.locator('.garden-plant-popover').count()) === 0, '未选中植物时不应显示底部植物提示。')
  assert((await page.locator('.garden-cell-plant-mergeable').count()) >= 6, '已有三株同系同阶植物时没有显示可融合材料线索。')
  await page.locator('.garden-cell').nth(18).click()
  assert((await page.locator('.garden-cell-merge-target').count()) >= 1, '已排成线的植物没有显示可直接融合目标。')
  await page.locator('.garden-cell').nth(18).click()
  await page.getByRole('gridcell', { name: '月影蕨类' }).waitFor({ state: 'visible' })
  const openSeedButton = page.getByRole('button').filter({ hasText: '打开' })
  await openSeedButton.click()
  assert((await page.locator('.garden-cell-filled').count()) === 5, '已有森林加一枚心种匣后植物数量异常。')
  assert((await page.locator('.garden-plant-popover').innerText()).includes('金币/小时'), '植物详情没有显示金币收益。')
  assert(!(await page.locator('.garden-plant-popover').innerText()).includes('这一天'), '植物详情不应再跳转到某天记录。')
  await page.locator('.garden-cell').nth(10).click()
  assert((await page.locator('.garden-cell-merge-target').count()) >= 1, '选中可融合植物后没有高亮融合目标格。')
  await page.locator('.garden-cell').nth(8).click()
  await page.getByRole('gridcell', { name: '晨露蕨类' }).waitFor({ state: 'visible' })
  assert((await page.locator('.garden-cell-filled').count()) === 3, '三株同系同阶植物没有融合成一株新植物。')
  assert((await page.locator('.garden-cell-plant-merged').count()) === 1, '融合后没有播放像素反馈动画。')
  const growthSaveAfterMerge = await page.evaluate(() => JSON.parse(window.localStorage.getItem('xinxiangyi-growth-game-v1') ?? '{}'))
  assert(growthSaveAfterMerge.mergeCount === 2, '融合次数没有写入成长存档。')
  assert(
    growthSaveAfterMerge.plants.some((plant) => plant.family === 'dew' && plant.stage === 2 && plant.placement === 'board'),
    '成长存档中没有生成二阶植物。',
  )
  await page.getByRole('button', { name: '菜单', exact: true }).click()
  const growthMenu = page.getByRole('dialog', { name: '库存' })
  await growthMenu.waitFor({ state: 'visible' })
  assert((await growthMenu.getAttribute('aria-modal')) === 'true', '成长菜单缺少 aria-modal。')
  await page.getByRole('tab', { name: '图谱', exact: true }).click()
  assert((await page.locator('.garden-codex-node-discovered').count()) >= 1, '打开植物后图谱没有点亮。')
  await page.getByRole('tab', { name: '成就', exact: true }).click()
  assert((await page.locator('.garden-achievement-grid').innerText()).includes('第一枚心种匣'), '成长页没有生成首次心种匣成就。')
  assert((await page.locator('.garden-achievement-grid').innerText()).includes('已获得'), '首次成长成就没有解锁。')
  await page.keyboard.press('Escape')
  await growthMenu.waitFor({ state: 'hidden' })
  await page.setViewportSize({ width: 390, height: 780 })
  await page.locator('.bottom-nav').waitFor({ state: 'visible' })
  assert((await page.locator('.nav-drawer').count()) === 0, '手机成长页不应显示左侧导航。')
  assert((await page.locator('.bottom-nav').innerText()).includes('成长'), '手机成长页应保留底部导航。')
  await assertNoGrowthPageScroll(page, '手机竖屏')
  await page.setViewportSize({ width: 844, height: 390 })
  await page.locator('.bottom-nav').waitFor({ state: 'visible' })
  await assertNoGrowthPageScroll(page, '手机横屏')
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.locator('.nav-drawer').waitFor({ state: 'visible' })

  await page.getByRole('button', { name: '记录', exact: true }).click()
  await page.getByRole('heading', { name: '年度心象', exact: true }).waitFor({ state: 'visible' })
  const yearHeatCell = page.getByRole('button', {
    name: `${todayKey}，心象 ${updatedEntriesPage.items[0].mood.score}`,
    exact: true,
  })
  assert(
    (await yearHeatCell.evaluate((element) => getComputedStyle(element).backgroundColor)) ===
      getExpectedHeatColor(updatedEntriesPage.items[0].mood.score),
    '年度心象热力图没有使用绿色/黄色新色阶。',
  )

  await page.getByRole('button', { name: '回顾', exact: true }).click()
  await page.getByRole('heading', { name: '心情日历', exact: true }).waitFor({ state: 'visible' })
  const selectedCalendarCell = page.locator('.calendar-heat-cell-selected')
  assert(
    (await selectedCalendarCell.evaluate((element) => getComputedStyle(element).outlineColor)) ===
      'rgb(227, 179, 65)',
    '月历当前日期没有使用黄色选中描边。',
  )

  await page.getByRole('button', { name: 'Todo', exact: true }).click()
  const addButton = page.getByRole('button', { name: '添加', exact: true })
  await addButton.focus()
  await addButton.click()
  const addDialog = page.getByRole('dialog', { name: '添加事项' })
  await addDialog.waitFor({ state: 'visible' })
  assert((await addDialog.getAttribute('aria-modal')) === 'true', '添加 Todo 弹窗缺少 aria-modal。')
  assert(
    (await page.evaluate(() => document.activeElement?.getAttribute('placeholder'))) ===
      '事项名称',
    '添加 Todo 弹窗没有聚焦主要输入框。',
  )
  assert((await addDialog.locator('textarea').count()) === 0, '添加 Todo 一级弹窗不应直接显示描述输入框。')
  assert((await addDialog.locator('.todo-priority-slider').count()) === 0, '添加 Todo 一级弹窗不应直接显示高级设置。')
  await addDialog.getByRole('button').filter({ hasText: '描述' }).click()
  const descriptionDialog = page.getByRole('dialog', { name: '添加详情描述' })
  await descriptionDialog.waitFor({ state: 'visible' })
  assert((await descriptionDialog.locator('textarea').count()) === 1, '描述应在二级弹窗中编辑。')
  await descriptionDialog.getByRole('button', { name: '完成', exact: true }).click()
  await addDialog.waitFor({ state: 'visible' })
  await addDialog.getByRole('button').filter({ hasText: '设置' }).click()
  const optionsDialog = page.getByRole('dialog', { name: '事项设置' })
  await optionsDialog.waitFor({ state: 'visible' })
  assert((await optionsDialog.locator('.todo-priority-slider input[type="range"]').count()) === 1, '重要级应以滑块展示。')
  assert((await optionsDialog.locator('select').count()) >= 1, '重复设置应使用规整选择控件。')
  assert((await optionsDialog.locator('input[type="time"]').count()) === 0, '未开启本地提醒前不应显示时间输入。')
  await optionsDialog.locator('.todo-form-row-inline input[type="checkbox"]').check()
  assert((await optionsDialog.locator('input[type="time"]').count()) === 1, '开启本地提醒后应显示时间输入。')
  await optionsDialog.getByRole('button', { name: '完成', exact: true }).click()
  await addDialog.waitFor({ state: 'visible' })
  await page.keyboard.press('Escape')
  await addDialog.waitFor({ state: 'hidden' })
  assert(await addButton.evaluate((element) => element === document.activeElement), '关闭后没有恢复到添加按钮。')

  const laneButton = page.getByRole('button', { name: '新增栏目' })
  await laneButton.focus()
  await laneButton.click()
  const laneDialog = page.getByRole('dialog', { name: '新建栏目' })
  await laneDialog.waitFor({ state: 'visible' })
  assert((await laneDialog.getAttribute('aria-modal')) === 'true', '栏目弹窗缺少 aria-modal。')
  await page.keyboard.press('Escape')
  await laneDialog.waitFor({ state: 'hidden' })
  assert(await laneButton.evaluate((element) => element === document.activeElement), '栏目弹窗关闭后没有恢复焦点。')

  assert((await page.getByRole('button', { name: /归档/ }).count()) === 0, '看板不应再显示归档入口。')
  const todoCard = page.locator('article.board-card').filter({ hasText: todoTitle })
  try {
    await todoCard.waitFor({ state: 'visible', timeout: 5_000 })
  } catch (error) {
    console.error('SMOKE_DEBUG_BOARD', (await page.locator('body').innerText()).slice(0, 6_000))
    throw error
  }
  await todoCard.click()
  const todoDetailDialog = page.getByRole('dialog', { name: todoTitle })
  await todoDetailDialog.waitFor({ state: 'visible' })
  assert((await todoDetailDialog.getAttribute('aria-modal')) === 'true', 'Todo 详情弹窗缺少 aria-modal。')
  await page.keyboard.press('Escape')
  await todoDetailDialog.waitFor({ state: 'hidden' })
  assert(await todoCard.evaluate((element) => element === document.activeElement), 'Todo 详情关闭后没有恢复焦点。')

  await page.getByRole('button', { name: '设置', exact: true }).click()
  const webDavButton = page.getByRole('button').filter({ hasText: 'WebDAV' })
  if ((await webDavButton.count()) === 0) {
    await page.getByRole('button').filter({ hasText: '存储与同步' }).click()
  }
  await page.getByRole('button').filter({ hasText: 'WebDAV' }).click()
  await page.getByRole('button', { name: '测试连接', exact: true }).click()
  const diagnosticDialog = page.getByRole('dialog', { name: 'WebDAV 测试诊断' })
  await diagnosticDialog.waitFor({ state: 'visible', timeout: 10_000 })
  assert((await diagnosticDialog.getAttribute('aria-modal')) === 'true', '诊断弹窗缺少 aria-modal。')
  await page.keyboard.press('Escape')
  await diagnosticDialog.waitFor({ state: 'hidden' })

  const unexpectedBrowserErrors = browserErrors.filter(
    (message) => !message.includes('Failed to load resource: the server responded with a status of 400'),
  )
  assert(unexpectedBrowserErrors.length === 0, `浏览器错误：${unexpectedBrowserErrors.join(' | ')}`)

  const finalState = await getJson('/api/state')
  console.log(
    `Isolated smoke passed: temp=${tempRoot}; api=${apiPort}; web=${webPort}; ` +
      `entries=${finalState.counts.entries}; todos=${finalState.counts.todos}; archived=${finalState.counts.archivedTodos}`,
  )
} finally {
  if (browser) await browser.close()
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode != null || child.signalCode != null) {
            resolve()
            return
          }
          child.once('exit', resolve)
          setTimeout(() => {
            if (!child.killed) child.kill('SIGKILL')
            resolve()
          }, 2_000).unref()
        }),
    ),
  )
  await rm(tempRoot, { recursive: true, force: true })
}
