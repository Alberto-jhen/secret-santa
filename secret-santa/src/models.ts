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
  returnTo?: string
}

export interface AuthContextValue<SessionType, UserType> {
  session: SessionType | null
  user: UserType | null
  loading: boolean
  isConfigured: boolean
  isLoggedIn: boolean
  signUp: (credentials: RegisterCredentials) => Promise<SessionType | null>
  signIn: (credentials: AuthCredentials) => Promise<void>
  signInWithMagicLink: (email: string, returnTo?: string) => Promise<void>
  requestPasswordReset: (email: string, returnTo?: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
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

export type GroupState = 'setup' | 'open' | 'drawn' | 'cancelled'
export type GroupMemberRole = 'organizer' | 'participant'
export type GroupMemberState = 'invited' | 'active' | 'declined' | 'left'
export type InvitationState =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'revoked'
  | 'expired'
export type NotificationState = 'queued' | 'sent' | 'failed'

export interface GroupSummary {
  group_id: string
  name: string
  state: GroupState
  minimum_budget: number | null
  maximum_budget: number | null
  currency: 'EUR'
  event_date: string | null
  locale: Locale
  exclusions_enabled: boolean
  member_role: GroupMemberRole
  active_member_count: number
  last_activity_at: string
}

export interface GroupRecord {
  id: string
  name: string
  state: GroupState
  minimum_budget: number | null
  maximum_budget: number | null
  currency: 'EUR'
  event_date: string | null
  locale: Locale
  exclusions_enabled: boolean
  last_activity_at: string
}

export interface GroupMember {
  member_id: string
  display_name: string
  role: GroupMemberRole
  state: GroupMemberState
  email: string | null
  invited_at: string
  accepted_at: string | null
}

export interface MyGroupMembership {
  member_id: string
  display_name: string
  role: GroupMemberRole
  state: GroupMemberState
}

export interface GroupInvitation {
  invitation_id: string
  member_id: string
  email: string
  display_name: string
  state: InvitationState
  delivery_state: NotificationState
  created_at: string
  expires_at: string
}

export interface GroupExclusion {
  giver_member_id: string
  excluded_member_id: string
}

export interface GroupActivity {
  activity_id: string
  actor_display_name: string
  event_type: string
  details: Record<string, unknown>
  created_at: string
}

export interface GroupAssignment {
  draw_id: string
  assigned_member_id: string
  assigned_name: string
}

export interface GiftIdea {
  id: string
  title: string
  url: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export interface InvitationPreview {
  invitationId: string
  groupId: string
  groupName: string
  displayName: string
  emailHint: string
  expiresAt: string
  locale: Locale
}

export interface GroupDrawResponse {
  drawId: string
  emailCount: number
  emailStatus: 'sent' | 'pending_delivery'
}
