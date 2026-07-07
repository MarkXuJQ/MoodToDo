export const getTodayKey = () => {
  const today = new Date()
  const local = new Date(today.getTime() - today.getTimezoneOffset() * 60_000)

  return local.toISOString().slice(0, 10)
}

export const toDateKey = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)

  return local.toISOString().slice(0, 10)
}

export const addDays = (dateKey: string, amount: number) => {
  const date = new Date(`${dateKey}T00:00:00`)
  date.setDate(date.getDate() + amount)

  return toDateKey(date)
}

export const formatDateLabel = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00`)

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date)
}

export const formatMonthLabel = (monthKey: string) => {
  const date = new Date(`${monthKey}-01T00:00:00`)

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
  }).format(date)
}

export const getWeekKey = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00`)
  const mondayOffset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - mondayOffset)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)

  return local.toISOString().slice(0, 10)
}

export const getWeekDays = (weekKey: string) => Array.from({ length: 7 }, (_, index) => addDays(weekKey, index))

export const getMonthDays = (monthKey: string) => {
  const first = new Date(`${monthKey}-01T00:00:00`)
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()

  return Array.from({ length: days }, (_, index) => `${monthKey}-${String(index + 1).padStart(2, '0')}`)
}

export const getDateWindow = (endDateKey: string, days: number) =>
  Array.from({ length: days }, (_, index) => addDays(endDateKey, index - (days - 1)))

export const formatShortDateLabel = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00`)

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(date)
}

export const getCalendarDates = (monthKey: string) => {
  const first = new Date(`${monthKey}-01T00:00:00`)
  const mondayOffset = (first.getDay() + 6) % 7
  first.setDate(first.getDate() - mondayOffset)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first)
    date.setDate(first.getDate() + index)

    return toDateKey(date)
  })
}

export const shiftMonth = (monthKey: string, amount: number) => {
  const date = new Date(`${monthKey}-01T00:00:00`)
  date.setMonth(date.getMonth() + amount)

  return toDateKey(date).slice(0, 7)
}
