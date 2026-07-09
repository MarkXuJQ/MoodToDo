import { type HTMLAttributes, type ReactNode, type RefObject } from 'react'
import { RefreshCw } from 'lucide-react'

import DynamicBackground from '../ui/dynamic-background'
import type { ToastState } from '../../hooks/use-toast'
import type { DiagnosticDialogState } from '../../utils/diagnostics'
import type { ActiveView, NavItem } from '../../types/app'
import { AppHeader } from './AppHeader'
import { BottomNav } from './BottomNav'
import { NavDrawer } from './NavDrawer'

type PullRefreshHandlers = Pick<
  HTMLAttributes<HTMLDivElement>,
  'onTouchCancel' | 'onTouchEnd' | 'onTouchMove' | 'onTouchStart'
>

type AppChromeProps = {
  activeView: ActiveView
  children: ReactNode
  contentShellRef: RefObject<HTMLDivElement | null>
  diagnosticDialog: DiagnosticDialogState | null
  isDesktopNav: boolean
  isNavCollapsed: boolean
  isNavOpen: boolean
  isPullRefreshing: boolean
  isWebDavSyncing: boolean
  navigationItems: NavItem[]
  pullRefreshDistance: number
  pullRefreshHandlers: PullRefreshHandlers
  resolvedThemeMode: 'light' | 'dark'
  todayLabel: string
  toast: ToastState | null
  onCloseDiagnostic: () => void
  onCloseNav: () => void
  onCopyDiagnosticDetails: () => void
  onDismissToast: () => void
  onNavigate: (view: ActiveView) => void
  onOpenSettings: () => void
  onSyncWebDav: () => void
  onToggleNavCollapse: () => void
}

export function AppChrome({
  activeView,
  children,
  contentShellRef,
  diagnosticDialog,
  isDesktopNav,
  isNavCollapsed,
  isNavOpen,
  isPullRefreshing,
  isWebDavSyncing,
  navigationItems,
  pullRefreshDistance,
  pullRefreshHandlers,
  resolvedThemeMode,
  todayLabel,
  toast,
  onCloseDiagnostic,
  onCloseNav,
  onCopyDiagnosticDetails,
  onDismissToast,
  onNavigate,
  onOpenSettings,
  onSyncWebDav,
  onToggleNavCollapse,
}: AppChromeProps) {
  const activeNavItem = navigationItems.find((item) => item.id === activeView)

  return (
    <main className="shell">
      <DynamicBackground mode={resolvedThemeMode} />
      <div
        className={`app-shell ${isDesktopNav ? 'app-shell-desktop-nav' : 'app-shell-bottom-nav'}`}
        style={{ ['--nav-width' as string]: isNavCollapsed ? '88px' : '296px' }}
      >
        {isDesktopNav && (
          <NavDrawer
            isDesktop={isDesktopNav}
            isOpen={isNavOpen}
            isCollapsed={isNavCollapsed}
            activeView={activeView}
            navigationItems={navigationItems}
            onClose={onCloseNav}
            onNavigate={onNavigate}
            onToggleCollapse={onToggleNavCollapse}
          />
        )}

        <div
          className="content-shell"
          ref={contentShellRef}
          {...pullRefreshHandlers}
        >
          <PullRefreshIndicator
            isPullRefreshing={isPullRefreshing}
            pullRefreshDistance={pullRefreshDistance}
          />
          <div className="page">
            <AppHeader
              isDesktopNav={isDesktopNav}
              todayLabel={todayLabel}
              activeViewLabel={activeNavItem?.label ?? '仪表盘'}
              isWebDavSyncing={isWebDavSyncing}
              onSyncWebDav={onSyncWebDav}
              onOpenSettings={onOpenSettings}
            />
            {children}
          </div>
        </div>
      </div>

      {toast && <ToastRegion toast={toast} onDismiss={onDismissToast} />}
      {diagnosticDialog && (
        <DiagnosticDialog
          dialog={diagnosticDialog}
          onClose={onCloseDiagnostic}
          onCopyDetails={onCopyDiagnosticDetails}
        />
      )}
      {!isDesktopNav && <BottomNav activeView={activeView} navigationItems={navigationItems} onNavigate={onNavigate} />}
    </main>
  )
}

type PullRefreshIndicatorProps = {
  isPullRefreshing: boolean
  pullRefreshDistance: number
}

function PullRefreshIndicator({ isPullRefreshing, pullRefreshDistance }: PullRefreshIndicatorProps) {
  return (
    <div
      className={`pull-refresh-indicator ${pullRefreshDistance > 0 || isPullRefreshing ? 'pull-refresh-indicator-visible' : ''}`}
      style={{ transform: `translate(-50%, ${Math.round(pullRefreshDistance * 0.36)}px)` }}
      aria-hidden={pullRefreshDistance === 0 && !isPullRefreshing}
    >
      <RefreshCw className={isPullRefreshing ? 'animate-spin' : ''} size={15} aria-hidden="true" />
      <span>{isPullRefreshing ? '刷新中' : pullRefreshDistance >= 64 ? '松开刷新' : '下拉刷新'}</span>
    </div>
  )
}

type ToastRegionProps = {
  toast: ToastState
  onDismiss: () => void
}

function ToastRegion({ toast, onDismiss }: ToastRegionProps) {
  return (
    <div className="toast-region" role="status" aria-live="polite">
      <div className={`app-toast app-toast-${toast.tone}`} key={toast.id}>
        <span className="toast-dot" aria-hidden="true" />
        <p>{toast.message}</p>
        <button className="toast-close" type="button" aria-label="关闭提示" onClick={onDismiss}>
          X
        </button>
        {toast.actionLabel && toast.onAction && (
          <button className="toast-action" type="button" onClick={toast.onAction}>
            {toast.actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}

type DiagnosticDialogProps = {
  dialog: DiagnosticDialogState
  onClose: () => void
  onCopyDetails: () => void
}

function DiagnosticDialog({ dialog, onClose, onCopyDetails }: DiagnosticDialogProps) {
  return (
    <div className="diagnostic-backdrop" role="presentation">
      <section className="diagnostic-dialog" role="dialog" aria-modal="true" aria-labelledby="diagnostic-title">
        <div className="section-head mb-3">
          <div>
            <p className="eyebrow">Diagnostics</p>
            <h2 className="section-title text-lg" id="diagnostic-title">
              {dialog.title}
            </h2>
          </div>
          <button className="icon-button" type="button" aria-label="关闭诊断" onClick={onClose}>
            X
          </button>
        </div>
        <p className="diagnostic-message">{dialog.message}</p>
        <textarea className="diagnostic-details" readOnly value={dialog.details} />
        <div className="diagnostic-actions">
          <button className="button-secondary min-h-10 px-3" type="button" onClick={onCopyDetails}>
            {dialog.copied ? '已复制' : '复制详情'}
          </button>
          <button className="button-primary min-h-10 px-3" type="button" onClick={onClose}>
            关闭
          </button>
        </div>
      </section>
    </div>
  )
}
