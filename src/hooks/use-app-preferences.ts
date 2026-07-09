import { useCallback, useMemo, useState, type ChangeEvent } from 'react'

import {
  aiConfigStorageKey,
  countdownDashboardTodoStorageKey,
  dashboardCardsStorageKey,
  gameEngineSettingsStorageKey,
  readAiConfig,
  readDashboardCards,
  readGameEngineSettings,
  readWebDavConfig,
  webDavConfigStorageKey,
} from '../config/app-shell'
import { defaultGameEngineSettings, type GameEngineSettings } from '../lib/gameEngine'
import type { AiConfig, DashboardCardConfig, DashboardCardId, WebDavConfig, WebDavTextConfigKey } from '../types/app'

const clampSnapshotDays = (value: number) =>
  Math.min(365, Math.max(7, Number(value) || defaultGameEngineSettings.snapshotDays))

export const useAppPreferences = () => {
  const [aiConfig, setAiConfig] = useState<AiConfig>(() => readAiConfig())
  const [webDavConfig, setWebDavConfig] = useState<WebDavConfig>(() => readWebDavConfig())
  const [gameEngineSettings, setGameEngineSettings] = useState<GameEngineSettings>(() => readGameEngineSettings())
  const [dashboardCards, setDashboardCards] = useState<DashboardCardConfig[]>(() => readDashboardCards())
  const [selectedCountdownTodoId, setSelectedCountdownTodoIdState] = useState(
    () => window.localStorage.getItem(countdownDashboardTodoStorageKey) ?? '',
  )

  const isWebDavConfigured = useMemo(
    () =>
      Boolean(
        webDavConfig.url.trim() &&
          webDavConfig.username.trim() &&
          webDavConfig.password.trim() &&
          webDavConfig.remotePath.trim(),
      ),
    [webDavConfig],
  )

  const handleAiConfigChange = useCallback(
    (key: keyof AiConfig) => (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value

      setAiConfig((current) => {
        const next = { ...current, [key]: value }
        window.localStorage.setItem(aiConfigStorageKey, JSON.stringify(next))

        return next
      })
    },
    [],
  )

  const handleWebDavConfigChange = useCallback(
    (key: WebDavTextConfigKey) => (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value

      setWebDavConfig((current) => {
        const next = { ...current, [key]: value }
        window.localStorage.setItem(webDavConfigStorageKey, JSON.stringify(next))

        return next
      })
    },
    [],
  )

  const handleWebDavAutoSyncChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked

    setWebDavConfig((current) => {
      const next = { ...current, autoSyncDaily: checked }
      window.localStorage.setItem(webDavConfigStorageKey, JSON.stringify(next))

      return next
    })
  }, [])

  const handleSnapshotDaysChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const snapshotDays = clampSnapshotDays(Number(event.target.value))

    setGameEngineSettings((current) => {
      const next = { ...current, snapshotDays }
      window.localStorage.setItem(gameEngineSettingsStorageKey, JSON.stringify(next))

      return next
    })
  }, [])

  const toggleDashboardCard = useCallback((cardId: DashboardCardId) => {
    setDashboardCards((current) => {
      const next = current.map((card) => (card.id === cardId ? { ...card, enabled: !card.enabled } : card))
      window.localStorage.setItem(dashboardCardsStorageKey, JSON.stringify(next))

      return next
    })
  }, [])

  const setSelectedCountdownTodoId = useCallback((todoId: string) => {
    setSelectedCountdownTodoIdState(todoId)

    if (todoId) {
      window.localStorage.setItem(countdownDashboardTodoStorageKey, todoId)
      return
    }

    window.localStorage.removeItem(countdownDashboardTodoStorageKey)
  }, [])

  return {
    aiConfig,
    dashboardCards,
    gameEngineSettings,
    handleAiConfigChange,
    handleSnapshotDaysChange,
    handleWebDavAutoSyncChange,
    handleWebDavConfigChange,
    isWebDavConfigured,
    selectedCountdownTodoId,
    setSelectedCountdownTodoId,
    toggleDashboardCard,
    webDavConfig,
  }
}
