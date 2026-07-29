export type AppError = {
  code: string
  message: string
  details?: string
  recoverable?: boolean
  operationId?: string
}

export function isAppError(value: unknown): value is AppError {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.code === "string" && typeof candidate.message === "string"
}

export function errorMessage(value: unknown): string {
  if (isAppError(value)) return value.message
  if (value instanceof Error) return value.message
  if (typeof value === "string") return value
  if (value == null) return "Unknown error"
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
