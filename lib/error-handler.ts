export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public type: 'validation' | 'auth' | 'database' | 'network' | 'unknown' = 'unknown'
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export interface ErrorHandlerOptions {
  showToast?: boolean
  logToConsole?: boolean
  fallbackMessage?: string
}

export function handleError(
  error: unknown,
  options: ErrorHandlerOptions = {}
): string {
  const { showToast = false, logToConsole = true, fallbackMessage = 'An unexpected error occurred' } = options

  let errorMessage: string
  let errorType: string = 'unknown'

  if (error instanceof AppError) {
    errorMessage = error.message
    errorType = error.type
  } else if (error instanceof Error) {
    errorMessage = error.message
    
    // Classify common error types
    if (error.message.includes('auth')) {
      errorType = 'auth'
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      errorType = 'network'
    } else if (error.message.includes('database') || error.message.includes('supabase')) {
      errorType = 'database'
    }
  } else if (typeof error === 'string') {
    errorMessage = error
  } else {
    errorMessage = fallbackMessage
  }

  if (logToConsole) {
    console.error(`[${errorType.toUpperCase()}] ${errorMessage}`, error)
  }

  // You could integrate with a toast library here if showToast is true
  if (showToast) {
    // Example: toast.error(errorMessage)
  }

  return errorMessage
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function validatePhone(phone: string): boolean {
  // Simple US phone number validation
  const phoneRegex = /^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/
  return phoneRegex.test(phone)
}

export function validateRequired(value: string | undefined | null, fieldName: string): void {
  if (!value || value.trim() === '') {
    throw new AppError(`${fieldName} is required`, 400, 'validation')
  }
}

export function validateMinLength(value: string, minLength: number, fieldName: string): void {
  if (value.length < minLength) {
    throw new AppError(`${fieldName} must be at least ${minLength} characters`, 400, 'validation')
  }
}

export function validateMaxLength(value: string, maxLength: number, fieldName: string): void {
  if (value.length > maxLength) {
    throw new AppError(`${fieldName} must be no more than ${maxLength} characters`, 400, 'validation')
  }
}

export function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, '')
}