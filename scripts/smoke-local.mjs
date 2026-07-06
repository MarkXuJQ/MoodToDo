import { chromium } from 'playwright-core'

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const targetUrl = process.env.SMOKE_URL ?? 'http://localhost:5173/'

const browser = await chromium.launch({
  headless: true,
  executablePath: chromePath,
})

try {
  const page = await browser.newPage()
  const messages = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      messages.push(message.text())
    }
  })
  page.on('pageerror', (error) => messages.push(error.message))

  await page.goto(targetUrl, { waitUntil: 'networkidle' })

  const suffix = Date.now()
  const title = `自动测试 ${suffix}`
  const todo = `验证 todo ${suffix}`

  await page.getByPlaceholder('今天的主线').fill(title)
  await page.getByPlaceholder('比如：上午焦虑但有推进，下午散步后恢复专注').fill('今天状态平稳，完成了本地数据库写入验证。')
  await page.getByPlaceholder('完成了什么，卡在哪里，下一步是什么').fill('测试保存日记、新增 todo、完成 todo。')
  await page.getByPlaceholder('工作 健康 学习').fill('测试 本地')
  await page.getByRole('button', { name: '保存' }).click()

  await page.waitForFunction(
    async (expectedTitle) => {
      const request = indexedDB.open('xinxiangyi_local')
      const db = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const tx = db.transaction(['entries'], 'readonly')
      const allRequest = tx.objectStore('entries').getAll()
      const entries = await new Promise((resolve, reject) => {
        allRequest.onsuccess = () => resolve(allRequest.result)
        allRequest.onerror = () => reject(allRequest.error)
      })
      db.close()

      return entries.some((entry) => entry.title === expectedTitle)
    },
    title,
    { timeout: 5000 },
  )

  await page.getByPlaceholder('新增一个事项').fill(todo)
  await page.getByRole('button', { name: '新增事项' }).click()
  await page.getByText(todo).waitFor({ state: 'visible', timeout: 5000 })
  await page.getByRole('button', { name: '标记完成' }).click()
  await page.getByRole('button', { name: '标记未完成' }).waitFor({ state: 'visible', timeout: 5000 })

  const todoDone = await page.evaluate(async (expectedTodo) => {
    const request = indexedDB.open('xinxiangyi_local')
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const tx = db.transaction(['todos'], 'readonly')
    const allRequest = tx.objectStore('todos').getAll()
    const todos = await new Promise((resolve, reject) => {
      allRequest.onsuccess = () => resolve(allRequest.result)
      allRequest.onerror = () => reject(allRequest.error)
    })
    db.close()

    return todos.some((item) => item.title === expectedTodo && item.done)
  }, todo)

  if (!todoDone) {
    throw new Error('Todo was not marked done in IndexedDB.')
  }

  if (messages.length > 0) {
    throw new Error(`Browser errors: ${messages.join(' | ')}`)
  }

  console.log(`Smoke passed: ${title}; ${todo}`)
} finally {
  await browser.close()
}
