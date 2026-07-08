import type { MoodSignals } from './mood'
import type { CalendarCell } from '../types/app'
import type { JournalEntry, TodoItem } from './db'
import { addDays, getCalendarDates, getMonthDays, getTodayKey, getWeekDays } from './calendar'

export const average = (values: number[]) => {
  if (values.length === 0) return 0

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

export const parseTags = (value: string) =>
  value
    .split(/[,，\s]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8)

export const getCompletionRate = (items: TodoItem[]) => {
  if (items.length === 0) return 0

  return Math.round((items.filter((item) => item.done).length / items.length) * 100)
}

export const getCheckinRate = (entries: JournalEntry[], monthKey: string) => {
  const todayKey = getTodayKey()
  const monthDays = getMonthDays(monthKey).filter((dateKey) => dateKey <= todayKey)

  if (monthDays.length === 0) return 0

  const entryDateKeys = new Set(entries.map((entry) => entry.dateKey))
  const checkedDays = monthDays.filter((dateKey) => entryDateKeys.has(dateKey)).length

  return Math.round((checkedDays / monthDays.length) * 100)
}

export const getCurrentStreak = (entries: JournalEntry[]) => {
  const entryDateKeys = new Set(entries.map((entry) => entry.dateKey))
  let cursor = getTodayKey()
  let streak = 0

  while (entryDateKeys.has(cursor)) {
    streak += 1
    cursor = addDays(cursor, -1)
  }

  return streak
}

export const getLongestStreak = (entries: JournalEntry[]) => {
  const sortedDateKeys = [...new Set(entries.map((entry) => entry.dateKey))].sort()
  let best = 0
  let current = 0
  let previous = ''

  for (const dateKey of sortedDateKeys) {
    current = previous && addDays(previous, 1) === dateKey ? current + 1 : 1
    best = Math.max(best, current)
    previous = dateKey
  }

  return best
}

export const getSignalValue = (signals: MoodSignals, key: keyof MoodSignals) => {
  const maxBySignal: Record<keyof MoodSignals, number> = {
    clarity: 35,
    load: 40,
    energy: 28,
    recovery: 28,
    reflection: 24,
  }

  return Math.round((signals[key] / maxBySignal[key]) * 100)
}

export const createCalendarCells = (monthKey: string, entries: JournalEntry[], todos: TodoItem[]): CalendarCell[] => {
  const entryMap = new Map(entries.map((entry) => [entry.dateKey, entry]))
  const todoMap = new Map<string, TodoItem[]>()

  for (const todo of todos) {
    todoMap.set(todo.dateKey, [...(todoMap.get(todo.dateKey) ?? []), todo])
  }

  return getCalendarDates(monthKey).map((dateKey) => ({
    dateKey,
    inMonth: dateKey.startsWith(monthKey),
    entry: entryMap.get(dateKey),
    todos: todoMap.get(dateKey) ?? [],
  }))
}

export const getHeatLevel = (entry?: JournalEntry) => {
  if (!entry) return 'empty'
  if (entry.mood.score < 35) return 'low'
  if (entry.mood.score < 50) return 'stress'
  if (entry.mood.score < 66) return 'steady'
  if (entry.mood.score < 82) return 'good'

  return 'bright'
}

export const buildWeeklyPrompt = (weekKey: string, entries: JournalEntry[], todos: TodoItem[]) => {
  const weekDays = getWeekDays(weekKey)
  const todoMap = new Map<string, TodoItem[]>()

  for (const todo of todos) {
    todoMap.set(todo.dateKey, [...(todoMap.get(todo.dateKey) ?? []), todo])
  }

  const entryMap = new Map(entries.map((entry) => [entry.dateKey, entry]))
  const lines = weekDays.map((dateKey) => {
    const entry = entryMap.get(dateKey)
    const dayTodos = todoMap.get(dateKey) ?? []
    const todoText = dayTodos.length
      ? dayTodos
          .map((todo) => `${todo.done ? '完成' : '未完成'}:${todo.title}`)
          .join('；')
      : '无事项'

    if (!entry) {
      return `${dateKey}: 未打卡；事项：${todoText}`
    }

    return [
      `${dateKey}: ${entry.title}`,
      `心象分 ${entry.mood.score}，象限 ${entry.mood.quadrant ?? '未知'}`,
      `心情：${entry.moodText || '未填写'}`,
      `记录：${entry.body || '未填写'}`,
      `事项：${todoText}`,
      `标签：${entry.tags.join(' ') || '无'}`,
    ].join('\n')
  })

  return `请用中文为这一周做一份温和、具体、可执行的复盘。不要做医学诊断，不要夸大结论。

输出结构：
1. 本周心象：2-3 句概括情绪走势和打卡情况。
2. 有迹可循的进步：列出 2-3 个真实进步信号。
3. 需要照看的模式：指出 1-2 个可能反复出现的压力或低能量模式。
4. 下周一个小动作：给出一个足够小、可执行、可验证的建议。

本周从 ${weekKey} 开始，原始记录如下：

${lines.join('\n\n')}`
}
