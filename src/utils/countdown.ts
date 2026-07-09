import { getTodayKey } from '../lib/calendar'
import type { TodoItem } from '../lib/db'

const dayMs = 24 * 60 * 60 * 1000

const toLocalDateTime = (dateKey: string) => new Date(`${dateKey}T00:00:00`).getTime()

export const getCountdownDaysRemaining = (targetDateKey: string, fromDateKey = getTodayKey()) =>
  Math.round((toLocalDateTime(targetDateKey) - toLocalDateTime(fromDateKey)) / dayMs)

export const formatCountdownDays = (daysRemaining: number) => {
  if (daysRemaining === 0) return '今天'
  if (daysRemaining > 0) return `还有 ${daysRemaining} 天`

  return `已超 ${Math.abs(daysRemaining)} 天`
}

export const getCountdownTone = (daysRemaining: number) => {
  if (daysRemaining < 0) return 'score-低落'
  if (daysRemaining <= 1) return 'score-紧张'
  if (daysRemaining <= 7) return 'score-平稳'

  return 'score-高亮'
}

export const sortCountdownTodos = (left: TodoItem, right: TodoItem) => {
  const leftDays = getCountdownDaysRemaining(left.dateKey)
  const rightDays = getCountdownDaysRemaining(right.dateKey)

  return leftDays - rightDays || left.dateKey.localeCompare(right.dateKey) || left.createdAt.localeCompare(right.createdAt)
}
