// Stub — will be replaced by session monitor implementation
export async function startBackend(_options?: {
  port?: number
  dataDir?: string
  authToken?: string
  allowedOrigins?: string[]
}): Promise<{
  close: () => Promise<void>
  sealDay: () => Promise<void>
}> {
  throw new Error('[backend] startBackend has been removed. Use session monitor instead.')
}

export function copyInitialTemplates(_builtinPersona: string): void {
  // Stub — does nothing
}
