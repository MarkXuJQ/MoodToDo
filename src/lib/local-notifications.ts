import { Capacitor } from '@capacitor/core'
import { LocalNotifications, type LocalNotificationSchema, type Schedule } from '@capacitor/local-notifications'

import type { TodoItem } from './db'
import { getTodoRepeatLabel } from '../utils/todo'

const todoReminderChannelId = 'xinxiangyi-todo-reminders'
const todoReminderSource = 'xinxiangyi-todo'
let channelReady = false

const shouldUseLocalNotifications = () => Capacitor.isNativePlatform()

const getTodoNotificationId = (todoId: string) => {
  let hash = 5381

  for (let index = 0; index < todoId.length; index += 1) {
    hash = (hash * 33) ^ todoId.charCodeAt(index)
  }

  return Math.abs(hash) % 2_000_000_000
}

const getTodoReminderKey = (todo: TodoItem) =>
  todo.repeatGroupId && todo.repeatFrequency !== 'none' ? todo.repeatGroupId : todo.id

const getReminderTimeParts = (todo: TodoItem) => {
  const match = todo.reminderTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (!match) return null

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  }
}

const getReminderDate = (todo: TodoItem) => {
  const time = getReminderTimeParts(todo)
  if (!time) return null

  const date = new Date(`${todo.dateKey}T00:00:00`)
  date.setHours(time.hour, time.minute, 0, 0)

  return Number.isFinite(date.getTime()) ? date : null
}

const getRecurringReminderSchedule = (todo: TodoItem): Schedule | null => {
  const time = getReminderTimeParts(todo)
  if (!time || todo.repeatFrequency === 'none') return null

  const date = new Date(`${todo.dateKey}T00:00:00`)
  if (!Number.isFinite(date.getTime())) return null

  if (todo.repeatFrequency === 'daily') {
    return {
      every: 'day',
      on: {
        hour: time.hour,
        minute: time.minute,
      },
    }
  }

  if (todo.repeatFrequency === 'weekly') {
    return {
      every: 'week',
      on: {
        weekday: (date.getDay() + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        hour: time.hour,
        minute: time.minute,
      },
    }
  }

  const reminderDay = Math.min(date.getDate(), 28)

  return {
    every: 'month',
    on: {
      day: reminderDay,
      hour: time.hour,
      minute: time.minute,
    },
  }
}

const ensureNotificationChannel = async () => {
  if (channelReady || Capacitor.getPlatform() !== 'android') return

  await LocalNotifications.createChannel({
    id: todoReminderChannelId,
    name: 'Todo 提醒',
    description: '心象仪 Todo 本地提醒',
    importance: 3,
    visibility: 1,
    vibration: true,
  })
  channelReady = true
}

const ensureNotificationPermission = async () => {
  const current = await LocalNotifications.checkPermissions()
  if (current.display === 'granted') return true
  if (current.display === 'denied') return false

  const requested = await LocalNotifications.requestPermissions()

  return requested.display === 'granted'
}

const cancelPendingTodoReminders = async () => {
  const pending = await LocalNotifications.getPending()
  const notifications = pending.notifications
    .filter((notification) => notification.extra?.source === todoReminderSource)
    .map((notification) => ({ id: notification.id }))

  if (notifications.length > 0) {
    await LocalNotifications.cancel({ notifications })
  }
}

const getLatestReminderTodos = (todos: TodoItem[]) => {
  const recurringTodos = new Map<string, TodoItem>()
  const singleTodos: TodoItem[] = []

  for (const todo of todos) {
    const repeatKey = todo.repeatGroupId || (todo.repeatFrequency !== 'none' ? todo.id : '')

    if (repeatKey) {
      const existing = recurringTodos.get(repeatKey)
      if (
        !existing ||
        todo.dateKey.localeCompare(existing.dateKey) > 0 ||
        (todo.dateKey === existing.dateKey && todo.createdAt.localeCompare(existing.createdAt) > 0)
      ) {
        recurringTodos.set(repeatKey, todo)
      }
      continue
    }

    if (todo.reminderEnabled && !todo.done) {
      singleTodos.push(todo)
    }
  }

  return [
    ...singleTodos,
    ...[...recurringTodos.values()].filter((todo) => todo.reminderEnabled && todo.repeatFrequency !== 'none'),
  ]
}

const createTodoReminderNotification = (todo: TodoItem, schedule: Schedule): LocalNotificationSchema => ({
  id: getTodoNotificationId(getTodoReminderKey(todo)),
  title: todo.title,
  body: todo.repeatFrequency === 'none'
    ? `${todo.dateKey} ${todo.reminderTime}`
    : `${getTodoRepeatLabel(todo.repeatFrequency)} ${todo.reminderTime}`,
  schedule,
  channelId: todoReminderChannelId,
  autoCancel: true,
  extra: {
    source: todoReminderSource,
    todoId: todo.id,
    dateKey: todo.dateKey,
  },
})

export const syncTodoReminders = async (todos: TodoItem[]) => {
  if (!shouldUseLocalNotifications()) return

  try {
    const now = new Date()
    const notifications = getLatestReminderTodos(todos)
      .flatMap((todo) => {
        if (todo.repeatFrequency !== 'none') {
          const schedule = getRecurringReminderSchedule(todo)

          return schedule ? [createTodoReminderNotification(todo, schedule)] : []
        }

        const at = getReminderDate(todo)

        return at && at > now ? [createTodoReminderNotification(todo, { at })] : []
      })

    await cancelPendingTodoReminders()

    if (notifications.length === 0) return

    const hasPermission = await ensureNotificationPermission()
    if (!hasPermission) return

    await ensureNotificationChannel()
    await LocalNotifications.schedule({ notifications })
  } catch (error) {
    console.warn('同步 Todo 本地提醒失败', error)
  }
}
