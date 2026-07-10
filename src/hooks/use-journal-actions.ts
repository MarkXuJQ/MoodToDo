import {
  useEffect,
  useState,
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react'

import { emptyDraft } from '../config/app-shell'
import {
  deleteAttachment,
  deleteJournalEntry,
  upsertJournalEntry,
  type AttachmentRecord,
  type JournalEntry,
} from '../lib/db'
import { formatDateLabel } from '../lib/calendar'
import { parseTags } from '../lib/insights'
import type { DraftState } from '../types/app'
import { getErrorMessage } from '../utils/errors'
import { getJournalText } from '../utils/journal'
import type { ToastState } from './use-toast'

type UseJournalActionsOptions = {
  refreshCore: () => Promise<unknown>
  selectedDate: string
  selectedEntry?: JournalEntry
  setAttachments: Dispatch<SetStateAction<AttachmentRecord[]>>
  setEntries: Dispatch<SetStateAction<JournalEntry[]>>
  showToast: (message: string, tone?: ToastState['tone']) => void
}

export const useJournalActions = ({
  refreshCore,
  selectedDate,
  selectedEntry,
  setAttachments,
  setEntries,
  showToast,
}: UseJournalActionsOptions) => {
  const [draft, setDraft] = useState<DraftState>(emptyDraft)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (selectedEntry) {
      setDraft({
        title: selectedEntry.title,
        journal: getJournalText(selectedEntry),
        tags: selectedEntry.tags.join(' '),
      })
      return
    }

    setDraft(emptyDraft)
  }, [selectedEntry])

  const canSave = Boolean(draft.journal.trim() || pendingFiles.length > 0)

  const handleDraftChange =
    (key: keyof DraftState) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft((current) => ({ ...current, [key]: event.target.value }))
    }

  const handleFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? [])

    if (nextFiles.length > 0) {
      setPendingFiles((current) => [...current, ...nextFiles])
    }

    event.target.value = ''
  }

  const handleRemovePendingFile = (index: number) => {
    setPendingFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSave || isSaving) return

    setIsSaving(true)

    try {
      const result = await upsertJournalEntry(
        {
          dateKey: selectedDate,
          title: draft.title.trim() || formatDateLabel(selectedDate),
          body: draft.journal.trim(),
          moodText: '',
          tags: parseTags(draft.tags),
        },
        pendingFiles,
      )
      setPendingFiles([])
      setEntries((current) => {
        const withoutEntry = current.filter((entry) => entry.id !== result.entry.id)

        return [result.entry, ...withoutEntry].sort((left, right) =>
          right.dateKey.localeCompare(left.dateKey),
        )
      })
      setAttachments((current) => {
        const knownIds = new Set(current.map((attachment) => attachment.id))

        return [...result.attachments.filter((attachment) => !knownIds.has(attachment.id)), ...current]
      })
      await refreshCore()
      showToast('日记已保存', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '保存日记失败。')
      showToast(message, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteAttachment = async (attachment: AttachmentRecord) => {
    try {
      await deleteAttachment(attachment)
      setAttachments((current) => current.filter((item) => item.id !== attachment.id))
      await refreshCore()
      showToast('图片已删除', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '删除附件失败。')
      showToast(message, 'error')
    }
  }

  const handleDeleteJournalEntry = async (entry: JournalEntry) => {
    const confirmed = window.confirm(`确认删除 ${entry.dateKey} 的日记记录吗？这会同时删除关联图片。`)
    if (!confirmed) return

    try {
      await deleteJournalEntry(entry)
      setEntries((current) => current.filter((item) => item.id !== entry.id))
      setAttachments((current) => current.filter((item) => item.entryId !== entry.id))
      await refreshCore()
      showToast('日记已删除', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '删除日记失败。')
      showToast(message, 'error')
    }
  }

  return {
    canSave,
    draft,
    handleDeleteAttachment,
    handleDeleteJournalEntry,
    handleDraftChange,
    handleFilesChange,
    handleRemovePendingFile,
    handleSave,
    isSaving,
    pendingFiles,
  }
}
