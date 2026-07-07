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
  page.on('dialog', async (dialog) => dialog.accept())

  const openNavigationTarget = async (name) => {
    const target = page.getByRole('button', { name })
    const fallbackTarget = typeof name === 'string' ? page.getByRole('button', { name: new RegExp(name) }) : target

    if ((await target.count()) > 0 && (await target.first().isVisible().catch(() => false))) {
      await target.first().click()
      return
    }

    if ((await fallbackTarget.count()) > 0 && (await fallbackTarget.first().isVisible().catch(() => false))) {
      await fallbackTarget.first().click()
      return
    }

    const toggle = page
      .getByRole('button', { name: /打开菜单|关闭菜单|展开侧栏|收起侧栏/ })
      .first()

    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click()
      if ((await target.count()) > 0) {
        await target.first().click()
        return
      }

      await fallbackTarget.first().click()
      return
    }

    throw new Error(`Navigation target not available: ${name}`)
  }

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
  await page.locator('input[type="file"]').setInputFiles('public/favicon.svg')
  await page.locator('.attachment-thumb').first().waitFor({ state: 'visible', timeout: 5000 })
  await page.locator('.attachment-media').first().click()
  await page.getByRole('dialog', { name: 'favicon.svg' }).waitFor({ state: 'visible', timeout: 5000 })
  await page.getByRole('button', { name: '关闭预览' }).nth(1).click()
  await page.getByRole('button', { name: '保存' }).click()

  await page.waitForFunction(
    async (expectedTitle) => {
      const state = await fetch('/api/state').then((response) => response.json())

      return state.entries.some((entry) => entry.title === expectedTitle)
    },
    title,
    { timeout: 5000 },
  )

  const dashboardTodoPanel = page.locator('.dashboard-todo-panel')
  await dashboardTodoPanel.getByPlaceholder('新增一个事项').fill(todo)
  await dashboardTodoPanel.getByRole('button', { name: '新增事项' }).click()
  await dashboardTodoPanel.getByText(todo).waitFor({ state: 'visible', timeout: 5000 })
  const todoRow = dashboardTodoPanel.getByRole('listitem').filter({ hasText: todo })
  await todoRow.getByRole('button', { name: '标记完成' }).click()
  await todoRow.getByRole('button', { name: '标记未完成' }).waitFor({ state: 'visible', timeout: 5000 })

  const todoDone = await page.evaluate(async (expectedTodo) => {
    const state = await fetch('/api/state').then((response) => response.json())

    return state.todos.some((item) => item.title === expectedTodo && item.done)
  }, todo)

  if (!todoDone) {
    throw new Error('Todo was not marked done in SQLite.')
  }

  await openNavigationTarget(/记录|日记浏览/)
  await page.getByPlaceholder('搜索标题、正文、心情、天气、标签').fill(title)
  await page.getByLabel(`选择 ${title}`).click()
  await page.getByRole('button', { name: '删除已选' }).click()
  await page.waitForFunction(
    async (expectedTitle) => {
      const state = await fetch('/api/state').then((response) => response.json())

      return !state.entries.some((entry) => entry.title === expectedTitle)
    },
    title,
    { timeout: 5000 },
  )

  if (messages.length > 0) {
    throw new Error(`Browser errors: ${messages.join(' | ')}`)
  }

  console.log(`Smoke passed: ${title}; ${todo}`)
} finally {
  await browser.close()
}
