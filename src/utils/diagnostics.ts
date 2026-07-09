export type DiagnosticDialogState = {
  title: string
  message: string
  details: string
  copied?: boolean
}

export const formatDiagnosticDetails = (scope: string, error: unknown, extra: Record<string, unknown> = {}) => {
  const diagnostic = typeof error === 'object' && error && 'diagnostic' in error ? (error as { diagnostic?: unknown }).diagnostic : undefined

  return JSON.stringify(
    {
      scope,
      at: new Date().toISOString(),
      location: window.location.href,
      userAgent: navigator.userAgent,
      viewport: {
        width: window.visualViewport?.width ?? window.innerWidth,
        height: window.visualViewport?.height ?? window.innerHeight,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      },
      extra,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
      diagnostic,
    },
    null,
    2,
  )
}
