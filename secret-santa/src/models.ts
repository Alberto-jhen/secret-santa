export type Locale = 'en' | 'es'

export interface I18nContextValue<TTranslationKey extends string> {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TTranslationKey) => string
}

export interface AuthCredentials {
  email: string
  password: string
}

export interface RegisterCredentials extends AuthCredentials {
  name: string
}

export interface AuthContextValue<SessionType, UserType> {
  session: SessionType | null
  user: UserType | null
  loading: boolean
  isConfigured: boolean
  isLoggedIn: boolean
  signUp: (credentials: RegisterCredentials) => Promise<SessionType | null>
  signIn: (credentials: AuthCredentials) => Promise<void>
  signOut: () => Promise<void>
}

export interface RegisterFormValues extends RegisterCredentials {
  confirmPassword: string
}

export interface GuestParticipantInput {
  clientId: string
  displayName: string
  email: string
  excludedClientIds: string[]
}

export interface GuestDrawResponse {
  status: 'sent' | 'pending_delivery'
  pendingCount: number
}

export interface GuestResult {
  displayName: string
  assignedName: string
  eventDate: string | null
  locale: Locale
  expiresAt: string
}

export interface DrawParticipant {
  id: string
  excludedIds: readonly string[]
}

export type GuestDeliveryState = 'queued' | 'sent' | 'failed'

export interface GuestDrawDeliveryRecord {
  participant_id: string
  display_name: string
  email: string
  assigned_name: string
  delivery_state: GuestDeliveryState
  claimed_by_request: boolean
}

export interface PendingGuestDelivery {
  draw_id: string
  participant_id: string
  display_name: string
  email: string
  assigned_name: string
  locale: Locale
}

export interface GuestAssignmentRecord {
  draw_id: string
  participant_id: string
  display_name: string
  email: string
  assigned_name: string
  event_date: string | null
  locale: Locale
  expires_at: string
}
