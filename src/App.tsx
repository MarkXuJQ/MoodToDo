import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import './App.css'
import { AppChrome } from './components/layout/AppChrome'
import {
  navigationItems,
  settingsSectionGroups,
  settingsSections,
} from './config/app-shell'
import { useAppPreferences } from './hooks/use-app-preferences'
import { useAppDerivedState } from './hooks/use-app-derived-state'
import { useJournalActions } from './hooks/use-journal-actions'
import { useLocalData } from './hooks/use-local-data'
import { useGrowthGame } from './hooks/use-growth-game'
import { usePullRefresh } from './hooks/use-pull-refresh'
import { useResponsiveNav } from './hooks/use-responsive-nav'
import { useSummaryActions } from './hooks/use-summary-actions'
import { useThemeMode } from './hooks/use-theme-mode'
import { useToast } from './hooks/use-toast'
import { useTodoBoardActions } from './hooks/use-todo-board-actions'
import { useWebDavActions } from './hooks/use-webdav-actions'
import { useViewportMetrics } from './hooks/use-viewport-metrics'
import {
  formatDateLabel,
  formatMonthLabel,
  getTodayKey,
  getWeekKey,
  shiftMonth,
} from './lib/calendar'
import {
  getCompletionRate,
  getHeatLevel,
} from './lib/insights'
import { getAttachmentContent } from './lib/db'
import type {
  ActiveView,
  SettingsSection,
} from './types/app'
import type { DiagnosticDialogState } from './utils/diagnostics'
import { BoardView } from './views/BoardView'
import { DashboardView } from './views/DashboardView'
import { JournalView } from './views/JournalView'
import { GardenView } from './views/GardenView'
import { SettingsView } from './views/SettingsView'
import { SummaryView } from './views/SummaryView'

const getInitialDateState = () => {
  const dateKey = getTodayKey()

  return {
    dateKey,
    monthKey: dateKey.slice(0, 7),
    weekKey: getWeekKey(dateKey),
  }
}

function App() {
  useViewportMetrics()

  const { toast, setToast, showToast } = useToast()
  const handleLocalDataError = useCallback((message: string) => showToast(message, 'error'), [showToast])
  const {
    attachments,
    boardLanes,
    changes,
    counts,
    databaseStatus,
    entries,
    hasLoadedLocalState,
    loadAttachmentsForEntry,
    loadMoreEntries,
    loadMoreTodos,
    loadingMore,
    pagination,
    refreshCore,
    reload,
    setAttachments,
    setBoardLanes,
    setEntries,
    setTodos,
    todos,
    weeklySummaries,
  } = useLocalData({ onLoadError: handleLocalDataError })
  const {
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
  } = useAppPreferences()
  const { resolvedThemeMode, setThemeMode: handleThemeModeChange, themeMode } = useThemeMode()
  const { isDesktopNav, isNavCollapsed, isNavOpen, setIsNavCollapsed, setIsNavOpen } = useResponsiveNav()
  const initialDateState = useMemo(() => getInitialDateState(), [])
  const [activeView, setActiveView] = useState<ActiveView>('dashboard')
  const [settingsMenuKey, setSettingsMenuKey] = useState(0)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('overview')
  const [selectedDate, setSelectedDate] = useState(initialDateState.dateKey)
  const [visibleMonth, setVisibleMonth] = useState(initialDateState.monthKey)
  const [selectedWeek, setSelectedWeek] = useState(initialDateState.weekKey)
  const [todoTitle, setTodoTitle] = useState('')
  const [diagnosticDialog, setDiagnosticDialog] = useState<DiagnosticDialogState | null>(null)
  const contentShellRef = useRef<HTMLDivElement | null>(null)
  const { isPullRefreshing, pullRefreshDistance, pullRefreshHandlers } = usePullRefresh({
    contentShellRef,
    isDesktopNav,
    onRefresh: reload,
  })

  useEffect(() => {
    void reload()
  }, [reload])

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.dateKey === selectedDate),
    [entries, selectedDate],
  )

  useEffect(() => {
    if (selectedEntry?.id) {
      void loadAttachmentsForEntry(selectedEntry.id)
    }
  }, [loadAttachmentsForEntry, selectedEntry?.id])

  const {
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
  } = useJournalActions({
    refreshCore,
    selectedDate,
    selectedEntry,
    setAttachments,
    setEntries,
    showToast,
  })

  const {
    handleAddBoardLane,
    handleAddTodo,
    handleAddTodoWithDetails,
    handleDeleteBoardLane,
    handleDeleteTodo,
    handleToggleTodo,
    handleUpdateTodoDetails,
  } = useTodoBoardActions({
    refreshCore,
    selectedDate,
    setBoardLanes,
    setTodoTitle,
    setTodos,
    showToast,
    todoTitle,
  })

  const {
    attachmentCountByEntryId,
    calendarCells,
    countdownTodoOptions,
    currentStreak,
    dashboardCardMetrics,
    dayTodos,
    entryByDate,
    filteredBoardTodos,
    gameEngineSnapshot,
    lastSevenAverage,
    lastSevenEntries,
    longestStreak,
    monthCheckinRate,
    monthCompletionRate,
    monthEntries,
    monthScore,
    moodBreakdownItems,
    moodTrendPoints,
    moodWindowAverage,
    pendingChangeCount,
    selectedAttachments,
    selectedCountdownTodo,
    selectedMoodTrendIndex,
    selectedWeekEntries,
    selectedWeekSummary,
    selectedWeekTodos,
    visibleDashboardCards,
  } = useAppDerivedState({
    attachments,
    boardLanes,
    changes,
    dashboardCards,
    entries,
    gameEngineSettings,
    pendingFileCount: pendingFiles.length,
    selectedCountdownTodoId,
    selectedDate,
    selectedEntry,
    selectedWeek,
    todos,
    visibleMonth,
    weeklySummaries,
  })

  const todayKey = getTodayKey()
  const {
    collectCoins: handleCollectGrowthCoins,
    growthGame,
    movePlant: handleMoveGrowthPlant,
    movePlantToCell: handleMoveGrowthPlantToCell,
    openSeedBox: handleOpenGrowthSeedBox,
    unlockCell: handleUnlockGrowthCell,
    upgradeStorage: handleUpgradeGrowthStorage,
  } = useGrowthGame(gameEngineSnapshot)

  const navigateTo = useCallback((view: ActiveView) => {
    setActiveView(view)
    if (!isDesktopNav) {
      setIsNavOpen(false)
    }
  }, [isDesktopNav, setIsNavOpen])

  const openSettingsSection = useCallback((section: SettingsSection) => {
    setSettingsSection(section)
    navigateTo('settings')
  }, [navigateTo])

  const openSettingsMenu = useCallback(() => {
    setSettingsSection('overview')
    setSettingsMenuKey((current) => current + 1)
    navigateTo('settings')
  }, [navigateTo])

  const focusDate = useCallback((dateKey: string, nextView: ActiveView = activeView) => {
    setSelectedDate(dateKey)
    setSelectedWeek(getWeekKey(dateKey))
    setVisibleMonth(dateKey.slice(0, 7))
    navigateTo(nextView)
  }, [activeView, navigateTo])

  const openWebDavSettings = useCallback(() => openSettingsSection('webdav'), [openSettingsSection])

  const {
    handleExportSyncBundle,
    handleTestWebDavConnection,
    handleWebDavReplaceCloud,
    handleWebDavRestoreFromCloud,
    handleWebDavSync,
    isExportingSyncBundle,
    isTestingWebDav,
    isWebDavSyncing,
    webDavTestResult,
  } = useWebDavActions({
    hasLoadedLocalState,
    isWebDavConfigured,
    onConfigureWebDav: openWebDavSettings,
    pendingChangeCount,
    reload,
    setDiagnosticDialog,
    showToast,
    todayKey,
    webDavConfig,
    webDavRecoveryRequired: databaseStatus.webDavRecoveryRequired,
  })

  const {
    canGenerateSummary,
    handleGenerateSummary,
    handleSaveSummaryDraft,
    isGeneratingSummary,
    setSummaryDraft,
    summaryDraft,
    summaryError,
  } = useSummaryActions({
    aiConfig,
    refreshCore,
    selectedWeek,
    selectedWeekEntries,
    selectedWeekSummary,
    selectedWeekTodos,
    showToast,
  })

  const handleCopyDiagnosticDetails = async () => {
    if (!diagnosticDialog) return

    try {
      await navigator.clipboard.writeText(diagnosticDialog.details)
      setDiagnosticDialog({ ...diagnosticDialog, copied: true })
    } catch {
      setDiagnosticDialog({ ...diagnosticDialog, copied: false })
    }
  }

  const todayHeaderLabel = formatDateLabel(todayKey)

  return (
    <AppChrome
      activeView={activeView}
      contentShellRef={contentShellRef}
      diagnosticDialog={diagnosticDialog}
      isDesktopNav={isDesktopNav}
      isNavCollapsed={isNavCollapsed}
      isNavOpen={isNavOpen}
      isPullRefreshing={isPullRefreshing}
      isWebDavSyncing={isWebDavSyncing}
      navigationItems={navigationItems}
      pullRefreshDistance={pullRefreshDistance}
      pullRefreshHandlers={pullRefreshHandlers}
      resolvedThemeMode={resolvedThemeMode}
      todayLabel={todayHeaderLabel}
      toast={toast}
      onCloseDiagnostic={() => setDiagnosticDialog(null)}
      onCloseNav={() => setIsNavOpen(false)}
      onCopyDiagnosticDetails={() => void handleCopyDiagnosticDetails()}
      onDismissToast={() => setToast(null)}
      onNavigate={navigateTo}
      onOpenSettings={openSettingsMenu}
      onSyncWebDav={() => void handleWebDavSync('manual')}
      onToggleNavCollapse={() => setIsNavCollapsed((current) => !current)}
    >
      {activeView === 'dashboard' ? (
        <DashboardView
          selectedDate={selectedDate}
          selectedDateLabel={formatDateLabel(selectedDate)}
          isToday={selectedDate === todayKey}
          visibleDashboardCards={visibleDashboardCards}
          selectedEntry={selectedEntry}
          draft={draft}
          pendingFiles={pendingFiles}
          selectedAttachments={selectedAttachments}
          canSave={canSave}
          isSaving={isSaving}
          dayTodos={dayTodos}
          todoTitle={todoTitle}
          lastSevenAverage={lastSevenAverage}
          lastSevenEntryCount={lastSevenEntries.length}
          moodBreakdownItems={moodBreakdownItems}
          moodTrendPoints={moodTrendPoints}
          selectedMoodTrendIndex={selectedMoodTrendIndex}
          moodWindowAverage={moodWindowAverage}
          onDateChange={(dateKey) => focusDate(dateKey, 'dashboard')}
          onGoToday={() => focusDate(todayKey, 'dashboard')}
          onDraftChange={handleDraftChange}
          onFilesChange={handleFilesChange}
          onSave={handleSave}
          onTodoTitleChange={setTodoTitle}
          onAddTodo={handleAddTodo}
          onToggleTodo={(todo) => void handleToggleTodo(todo)}
          onDeleteTodo={(todo) => void handleDeleteTodo(todo)}
          onDeleteAttachment={(attachment) => void handleDeleteAttachment(attachment)}
          onLoadAttachmentContent={getAttachmentContent}
          onRemovePendingFile={handleRemovePendingFile}
          getCompletionRate={getCompletionRate}
        />
      ) : activeView === 'journal' ? (
        <JournalView
          entries={entries}
          entriesTotal={counts.entries}
          hasMoreEntries={pagination.entries.hasMore}
          isLoadingMoreEntries={loadingMore.entries}
          todos={todos}
          currentStreak={currentStreak}
          pendingChangeCount={pendingChangeCount}
          attachmentCountByEntryId={attachmentCountByEntryId}
          onLoadMoreEntries={() => void loadMoreEntries()}
          onFocusDate={focusDate}
          onDeleteEntry={(entry) => void handleDeleteJournalEntry(entry)}
        />
      ) : activeView === 'garden' ? (
        <GardenView
          growthGame={growthGame}
          snapshot={gameEngineSnapshot}
          onCollectCoins={handleCollectGrowthCoins}
          onMovePlant={handleMoveGrowthPlant}
          onMovePlantToCell={handleMoveGrowthPlantToCell}
          onOpenSeedBox={handleOpenGrowthSeedBox}
          onUnlockCell={handleUnlockGrowthCell}
          onUpgradeStorage={handleUpgradeGrowthStorage}
        />
      ) : activeView === 'board' ? (
        <BoardView
          todos={todos}
          todosTotal={counts.todos}
          hasMoreTodos={pagination.todos.hasMore}
          isLoadingMoreTodos={loadingMore.todos}
          filteredBoardTodos={filteredBoardTodos}
          boardLanes={boardLanes}
          entryByDate={entryByDate}
          selectedDate={selectedDate}
          todoTitle={todoTitle}
          onFocusDate={focusDate}
          onTodoTitleChange={setTodoTitle}
          onAddTodoWithDetails={(dateKey, title, details) => void handleAddTodoWithDetails(dateKey, title, details)}
          onUpdateTodoDetails={(todo, details) => void handleUpdateTodoDetails(todo, details)}
          onAddBoardLane={(label, colorId) => void handleAddBoardLane(label, colorId)}
          onDeleteBoardLane={(lane) => void handleDeleteBoardLane(lane)}
          onToggleTodo={(todo) => void handleToggleTodo(todo)}
          onDeleteTodo={(todo) => void handleDeleteTodo(todo)}
          onLoadMoreTodos={() => void loadMoreTodos()}
        />
      ) : activeView === 'summary' ? (
        <SummaryView
          visibleMonthLabel={formatMonthLabel(visibleMonth)}
          monthScore={monthScore}
          monthCheckinRate={monthCheckinRate}
          monthCompletionRate={monthCompletionRate}
          currentStreak={currentStreak}
          longestStreak={longestStreak}
          monthEntriesCount={monthEntries.length}
          calendarCells={calendarCells}
          selectedDate={selectedDate}
          selectedWeek={selectedWeek}
          selectedWeekEntryCount={selectedWeekEntries.length}
          entries={entries}
          todos={todos}
          aiConfigured={Boolean(aiConfig.apiKey)}
          aiModel={aiConfig.model}
          canGenerateSummary={canGenerateSummary}
          isGeneratingSummary={isGeneratingSummary}
          summaryDraft={summaryDraft}
          summaryError={summaryError}
          todoTitle={todoTitle}
          onPreviousMonth={() => setVisibleMonth(shiftMonth(visibleMonth, -1))}
          onNextMonth={() => setVisibleMonth(shiftMonth(visibleMonth, 1))}
          onFocusDate={(dateKey) => focusDate(dateKey, 'summary')}
          onSelectedWeekChange={(dateKey) => setSelectedWeek(getWeekKey(dateKey))}
          onOpenAiSettings={() => openSettingsSection('ai')}
          onGenerateSummary={() => void handleGenerateSummary()}
          onSummaryDraftChange={setSummaryDraft}
          onSaveSummary={() => void handleSaveSummaryDraft()}
          onTodoTitleChange={setTodoTitle}
          onAddTodo={handleAddTodo}
          onToggleTodo={(todo) => void handleToggleTodo(todo)}
          onDeleteTodo={(todo) => void handleDeleteTodo(todo)}
          getCompletionRate={getCompletionRate}
          getHeatLevel={getHeatLevel}
        />
      ) : (
        <SettingsView
          settingsSection={settingsSection}
          settingsSections={settingsSections}
          settingsSectionGroups={settingsSectionGroups}
          isDesktopNav={isDesktopNav}
          settingsMenuKey={settingsMenuKey}
          databaseStatus={databaseStatus}
          entriesCount={counts.entries}
          todosCount={counts.todos}
          attachmentsCount={counts.attachments}
          weeklySummariesCount={weeklySummaries.length}
          changesCount={changes.length}
          pendingChangeCount={pendingChangeCount}
          gameEngineSnapshot={gameEngineSnapshot}
          gameEngineSettings={gameEngineSettings}
          dashboardCards={dashboardCards}
          dashboardCardMetrics={dashboardCardMetrics}
          visibleDashboardCards={visibleDashboardCards}
          countdownTodoOptions={countdownTodoOptions}
          selectedCountdownTodoId={selectedCountdownTodo?.id ?? ''}
          aiConfig={aiConfig}
          webDavConfig={webDavConfig}
          isTestingWebDav={isTestingWebDav}
          isWebDavSyncing={isWebDavSyncing}
          isExportingSyncBundle={isExportingSyncBundle}
          webDavTestResult={webDavTestResult}
          themeMode={themeMode}
          resolvedThemeMode={resolvedThemeMode}
          onSettingsSectionChange={setSettingsSection}
          onReload={() => void reload()}
          onToggleDashboardCard={toggleDashboardCard}
          onAiConfigChange={handleAiConfigChange}
          onWebDavConfigChange={handleWebDavConfigChange}
          onWebDavAutoSyncChange={handleWebDavAutoSyncChange}
          onCountdownTodoSelect={setSelectedCountdownTodoId}
          onTestWebDavConnection={() => void handleTestWebDavConnection()}
          onExportSyncBundle={() => void handleExportSyncBundle()}
          onRestoreWebDavSnapshot={() => void handleWebDavRestoreFromCloud()}
          onReplaceWebDavSnapshot={() => void handleWebDavReplaceCloud()}
          onThemeModeChange={handleThemeModeChange}
          onSnapshotDaysChange={handleSnapshotDaysChange}
        />
      )}
    </AppChrome>
  )
}

export default App
