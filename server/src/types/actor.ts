export type ActorRole = 'admin' | 'chunhiem' | 'phuta' | 'phuhuynh'

/**
 * Transport-neutral identity used by application/domain authorization rules.
 * Token lifecycle fields deliberately stay in middleware/auth.
 */
export interface ActorContext {
  userId: string
  role: ActorRole
  parishId: string
}
