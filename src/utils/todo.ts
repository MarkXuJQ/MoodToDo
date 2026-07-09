import type { TodoItem } from '../lib/db'

export const completedTodoRetentionMs = 14 * 24 * 60 * 60 * 1000

export const getTodoCompletedAt = (todo: TodoItem) => {
  const timestamp = new Date(todo.completedAt ?? todo.updatedAt).getTime()

  return Number.isFinite(timestamp) ? timestamp : null
}

export const sortTodosByDateThenCreatedAt = (left: TodoItem, right: TodoItem) =>
  left.dateKey.localeCompare(right.dateKey) || left.createdAt.localeCompare(right.createdAt)
