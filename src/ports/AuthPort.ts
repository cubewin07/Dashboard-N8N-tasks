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
}
