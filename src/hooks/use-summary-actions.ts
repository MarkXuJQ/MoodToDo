import { useEffect, useState } from 'react'

import { getApiRequestHeaders, getApiUrl, upsertWeeklySummary, type JournalEntry, type TodoItem, type WeeklySummary } from '../lib/db'
import { buildWeeklyPrompt } from '../lib/insights'
import type { AiConfig } from '../types/app'
import { getErrorMessage } from '../utils/errors'
import type { ToastState } from './use-toast'

type UseSummaryActionsOptions = {
  aiConfig: AiConfig
  refreshCore: () => Promise<unknown>
  selectedWeek: string
  selectedWeekEntries: JournalEntry[]
  selectedWeekSummary?: WeeklySummary
  selectedWeekTodos: TodoItem[]
  showToast: (message: string, tone?: ToastState['tone']) => void
}

export const useSummaryActions = ({
  aiConfig,
  refreshCore,
  selectedWeek,
  selectedWeekEntries,
  selectedWeekSummary,
  selectedWeekTodos,
  showToast,
}: UseSummaryActionsOptions) => {
  const [summaryDraft, setSummaryDraft] = useState('')
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const canGenerateSummary = Boolean(aiConfig.endpoint.trim() && aiConfig.apiKey.trim() && selectedWeekEntries.length > 0)

  useEffect(() => {
    setSummaryDraft(selectedWeekSummary?.content ?? '')
  }, [selectedWeekSummary])

  const handleGenerateSummary = async () => {
    if (!canGenerateSummary || isGeneratingSummary) return

    setIsGeneratingSummary(true)
    setSummaryError('')

    try {
      const response = await fetch(getApiUrl('/api/ai/weekly-summary'), {
        method: 'POST',
        headers: getApiRequestHeaders(),
        body: JSON.stringify({
          endpoint: aiConfig.endpoint.trim(),
          apiKey: aiConfig.apiKey.trim(),
          model: aiConfig.model.trim(),
          messages: [
            {
              role: 'system',
              content: '你是一个克制、温和、具体的个人复盘助手。只根据用户给出的本地记录总结，不臆测。',
            },
            {
              role: 'user',
              content: buildWeeklyPrompt(selectedWeek, selectedWeekEntries, selectedWeekTodos),
            },
          ],
          temperature: 0.4,
        }),
      })
      const payload = (await response.json()) as { content?: string; error?: string }
      const content = payload.content?.trim() ?? ''

      if (!response.ok) {
        throw new Error(payload.error || `请求失败：${response.status}`)
      }

      if (!content) {
        throw new Error('模型没有返回可用内容。')
      }

      const summary = await upsertWeeklySummary(selectedWeek, content, aiConfig.model.trim())
      setSummaryDraft(summary.content)
      await refreshCore()
      showToast('周总结已生成', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '生成周总结失败。')
      setSummaryError(message)
      showToast(message, 'error')
    } finally {
      setIsGeneratingSummary(false)
    }
  }

  const handleSaveSummaryDraft = async () => {
    const content = summaryDraft.trim()
    if (!content) return

    setSummaryError('')

    try {
      await upsertWeeklySummary(selectedWeek, content, 'manual', 'local')
      await refreshCore()
      showToast('周总结已保存', 'success')
    } catch (error) {
      const message = getErrorMessage(error, '保存周总结失败。')
      setSummaryError(message)
      showToast(message, 'error')
    }
  }

  return {
    canGenerateSummary,
    handleGenerateSummary,
    handleSaveSummaryDraft,
    isGeneratingSummary,
    setSummaryDraft,
    summaryDraft,
    summaryError,
  }
}
