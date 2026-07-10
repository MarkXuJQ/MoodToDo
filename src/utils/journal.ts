import type { JournalEntry } from '../lib/db'

const normalizeText = (value: string) => value.trim().replace(/\r\n/g, '\n')

export const getJournalText = (entry: Pick<JournalEntry, 'body' | 'moodText'>) => {
  const body = normalizeText(entry.body)
  const legacyMoodText = normalizeText(entry.moodText)

  if (!legacyMoodText) return body
  if (!body) return legacyMoodText
  if (body === legacyMoodText || body.includes(legacyMoodText)) return body

  return `${legacyMoodText}\n\n${body}`
}
