import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'

import { webDavLastAutoSyncStorageKey } from '../config/app-shell'
import {
  exportSyncBundle,
  pullWebDavSnapshot,
  pushWebDavSnapshot,
  testWebDavConnection,
  type WebDavConnectionTestResult,
} from '../lib/db'
import type { WebDavConfig } from '../types/app'
import { formatDiagnosticDetails, type DiagnosticDialogState } from '../utils/diagnostics'
import { getErrorMessage } from '../utils/errors'
import { formatWebDavSyncMessage, isMissingRemoteSnapshotMessage } from '../utils/webdav'
import type { ToastState } from './use-toast'

type UseWebDavActionsOptions = {
  hasLoadedLocalState: boolean
  isWebDavConfigured: boolean
  onConfigureWebDav: () => void
  pendingChangeCount: number
  reload: () => Promise<unknown>
  setDiagnosticDialog: Dispatch<SetStateAction<DiagnosticDialogState | null>>
  showToast: (message: string, tone?: ToastState['tone']) => void
  todayKey: string
  webDavConfig: WebDavConfig
}

export const useWebDavActions = ({
  hasLoadedLocalState,
  isWebDavConfigured,
  onConfigureWebDav,
  pendingChangeCount,
  reload,
  setDiagnosticDialog,
  showToast,
  todayKey,
  webDavConfig,
}: UseWebDavActionsOptions) => {
  const [isWebDavSyncing, setIsWebDavSyncing] = useState(false)
  const [isTestingWebDav, setIsTestingWebDav] = useState(false)
  const [isExportingSyncBundle, setIsExportingSyncBundle] = useState(false)
  const [webDavTestResult, setWebDavTestResult] = useState<WebDavConnectionTestResult | null>(null)

  const handleTestWebDavConnection = async () => {
    if (isTestingWebDav) return

    if (!isWebDavConfigured) {
      const message = '请先填写 WebDAV Server URL、用户名、应用密码和远端目录。'
      setWebDavTestResult({
        ok: false,
        pathExists: false,
        writable: false,
        status: 0,
        remotePath: webDavConfig.remotePath,
        checkedAt: new Date().toISOString(),
        message,
      })
      showToast(message, 'error')
      return
    }

    setIsTestingWebDav(true)
    setWebDavTestResult(null)

    try {
      const result = await testWebDavConnection(webDavConfig)
      setWebDavTestResult(result)
      showToast(result.message, result.ok ? 'success' : 'error')
    } catch (error) {
      const message = getErrorMessage(error, 'WebDAV 连接测试失败。')
      const actionableMessage =
        message === 'API route not found.'
          ? '本地 SQLite API 还没有重启到支持 WebDAV 测试的新版本。请重启 npm run dev 后再测试。'
          : message

      setWebDavTestResult({
        ok: false,
        pathExists: false,
        writable: false,
        status: 0,
        remotePath: webDavConfig.remotePath,
        checkedAt: new Date().toISOString(),
        message: actionableMessage,
      })
      showToast(actionableMessage, 'error')
      setDiagnosticDialog({
        title: 'WebDAV 测试诊断',
        message: actionableMessage,
        details: formatDiagnosticDetails('webdav.test', error, {
          url: webDavConfig.url,
          remotePath: webDavConfig.remotePath,
          usernameLength: webDavConfig.username.length,
        }),
      })
    } finally {
      setIsTestingWebDav(false)
    }
  }

  const handleExportSyncBundle = async () => {
    if (isExportingSyncBundle) return

    setIsExportingSyncBundle(true)

    try {
      const result = await exportSyncBundle()
      const files = result.files.map((file) => file.name).join('、')

      showToast(`本地同步包已生成：${result.path}；包含 ${files}`, 'success')
      await reload()
    } catch (error) {
      const message = getErrorMessage(error, '生成本地同步包失败。')

      showToast(message, 'error')
      setDiagnosticDialog({
        title: '本地同步包诊断',
        message,
        details: formatDiagnosticDetails('sync-bundle.export', error),
      })
    } finally {
      setIsExportingSyncBundle(false)
    }
  }

  const handleWebDavSync = useCallback(async (source: 'manual' | 'startup' = 'manual') => {
    if (isWebDavSyncing) return

    if (!isWebDavConfigured) {
      if (source === 'manual') {
        showToast('请先配置 WebDAV', 'error')
        onConfigureWebDav()
      }
      return
    }

    setIsWebDavSyncing(true)

    try {
      const shouldPush = pendingChangeCount > 0
      const result = await (shouldPush ? pushWebDavSnapshot(webDavConfig) : pullWebDavSnapshot(webDavConfig))

      window.localStorage.setItem(webDavLastAutoSyncStorageKey, todayKey)
      showToast(formatWebDavSyncMessage(result), 'success')
      await reload()
    } catch (error) {
      const message = getErrorMessage(error, '同步失败。')

      if (source === 'manual' && pendingChangeCount === 0 && isMissingRemoteSnapshotMessage(message)) {
        try {
          const result = await pushWebDavSnapshot(webDavConfig)

          window.localStorage.setItem(webDavLastAutoSyncStorageKey, todayKey)
          showToast(`远端目录已初始化；${formatWebDavSyncMessage(result)}`, 'success')
          await reload()
          return
        } catch (fallbackError) {
          const fallbackMessage = getErrorMessage(fallbackError, '初始化远端同步目录失败。')

          showToast(fallbackMessage, 'error')
          setDiagnosticDialog({
            title: 'WebDAV 初始化诊断',
            message: fallbackMessage,
            details: formatDiagnosticDetails('webdav.sync.initialize', fallbackError, {
              url: webDavConfig.url,
              remotePath: webDavConfig.remotePath,
              usernameLength: webDavConfig.username.length,
              pendingChangeCount,
              originalPullError: message,
            }),
          })
          return
        }
      }

      if (source === 'manual') {
        showToast(message, 'error')
        setDiagnosticDialog({
          title: 'WebDAV 同步诊断',
          message,
          details: formatDiagnosticDetails('webdav.sync', error, {
            url: webDavConfig.url,
            remotePath: webDavConfig.remotePath,
            usernameLength: webDavConfig.username.length,
            pendingChangeCount,
            intendedDirection: pendingChangeCount > 0 ? 'push' : 'pull',
          }),
        })
      }
    } finally {
      setIsWebDavSyncing(false)
    }
  }, [
    isWebDavConfigured,
    isWebDavSyncing,
    onConfigureWebDav,
    pendingChangeCount,
    reload,
    setDiagnosticDialog,
    showToast,
    todayKey,
    webDavConfig,
  ])

  const handleWebDavRestoreFromCloud = useCallback(async () => {
    if (isWebDavSyncing) return

    if (!isWebDavConfigured) {
      showToast('请先配置 WebDAV', 'error')
      onConfigureWebDav()
      return
    }

    const confirmed = window.confirm('从云端恢复会用远端快照替换本机数据。本机尚未同步的记录可能丢失，确定继续吗？')
    if (!confirmed) return

    setIsWebDavSyncing(true)

    try {
      const result = await pullWebDavSnapshot(webDavConfig)

      window.localStorage.setItem(webDavLastAutoSyncStorageKey, todayKey)
      showToast(formatWebDavSyncMessage(result), 'success')
      await reload()
    } catch (error) {
      const message = getErrorMessage(error, '从云端恢复失败。')
      showToast(message, 'error')
      setDiagnosticDialog({
        title: 'WebDAV 恢复诊断',
        message,
        details: formatDiagnosticDetails('webdav.restore', error, {
          url: webDavConfig.url,
          remotePath: webDavConfig.remotePath,
          usernameLength: webDavConfig.username.length,
          pendingChangeCount,
        }),
      })
    } finally {
      setIsWebDavSyncing(false)
    }
  }, [
    isWebDavConfigured,
    isWebDavSyncing,
    onConfigureWebDav,
    pendingChangeCount,
    reload,
    setDiagnosticDialog,
    showToast,
    todayKey,
    webDavConfig,
  ])

  useEffect(() => {
    if (!hasLoadedLocalState || !webDavConfig.autoSyncDaily || !isWebDavConfigured || isWebDavSyncing) return
    if (window.localStorage.getItem(webDavLastAutoSyncStorageKey) === todayKey) return

    void handleWebDavSync('startup')
  }, [handleWebDavSync, hasLoadedLocalState, isWebDavConfigured, isWebDavSyncing, todayKey, webDavConfig.autoSyncDaily])

  return {
    handleExportSyncBundle,
    handleTestWebDavConnection,
    handleWebDavRestoreFromCloud,
    handleWebDavSync,
    isExportingSyncBundle,
    isTestingWebDav,
    isWebDavSyncing,
    webDavTestResult,
  }
}
