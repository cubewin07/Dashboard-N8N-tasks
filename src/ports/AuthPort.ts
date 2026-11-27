export interface Session {
  userId: string
  email: string
  role: 'boss' | 'stylist'
  displayName: string
}

export interface AuthPort {
  session(): Session | null
  onChange(cb: (s: Session | null) => void): () => void
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  sendPasswordReset(email: string): Promise<void>
  /** Set a new password for the signed-in (or recovery) session. Absent on the demo port. */
  updatePassword?(password: string): Promise<void>
}

export type AuthErrorCode = 'invalid_credentials' | 'not_allowed' | 'network' | 'unknown'

/** Thrown by `signIn` / `updatePassword`; the UI maps `code` to an i18n message. */
export class AuthError extends Error {
  readonly code: AuthErrorCode
  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'AuthError'
    this.code = code
  }
}
