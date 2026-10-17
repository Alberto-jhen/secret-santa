import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { AuthContextValue } from '../models'

export const AuthContext = createContext<AuthContextValue<Session, User> | null>(
  null,
)
