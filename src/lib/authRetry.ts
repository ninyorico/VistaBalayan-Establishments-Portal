const FUTURE_JWT_PATTERN = /jwt.*issued.*future|issued.*future.*jwt/i

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export const isFutureJwtError = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : String(error || '')
  return FUTURE_JWT_PATTERN.test(message)
}

export async function retryFutureJwt<T>(
  operation: () => Promise<T>,
  refreshSession: () => Promise<unknown>,
  retries = 2,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (!isFutureJwtError(error) || attempt >= retries) throw error
      await wait(750 * (attempt + 1))
      await refreshSession().catch(() => undefined)
      await wait(250)
    }
  }
}
