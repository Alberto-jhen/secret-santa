import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { AuthCredentials, RegisterCredentials } from '../models'
import { AuthConfigurationError } from '../lib/authErrors'
import { authCallbackUrl, safeReturnTo } from '../lib/authRedirect'
import { getSupabaseClient } from '../lib/supabase'
import { AuthContext } from './AuthContext'

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [supabase] = useState(() => {
    try {
      return getSupabaseClient()
    } catch {
      return null
    }
  })
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(supabase !== null)

  useEffect(() => {
    if (!supabase) {
      return
    }
    const client = supabase

    let isMounted = true
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return
      }

      setSession(nextSession)
      setLoading(false)
    })

    async function restoreSession() {
      try {
        const { data, error } = await client.auth.getSession()

        if (error) {
          throw error
        }

        if (isMounted) {
          setSession(data.session)
        }
      } catch {
        if (isMounted) {
          setSession(null)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    void restoreSession()

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [supabase])

  const requireClient = useCallback(() => {
    if (!supabase) {
      throw new AuthConfigurationError()
    }

    return supabase
  }, [supabase])

  const signUp = useCallback(
    async ({ name, email, password, returnTo }: RegisterCredentials) => {
      const client = requireClient()
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { name: name.trim() },
          emailRedirectTo: authCallbackUrl(returnTo ?? '/groups'),
        },
      })

      if (error) {
        throw error
      }

      return data.session
    },
    [requireClient],
  )

  const signIn = useCallback(
    async ({ email, password }: AuthCredentials) => {
      const client = requireClient()
      const { error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        throw error
      }
    },
    [requireClient],
  )

  const signInWithMagicLink = useCallback(
    async (email: string, returnTo = '/groups') => {
      const client = requireClient()
      const { error } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: authCallbackUrl(returnTo),
          shouldCreateUser: false,
        },
      })

      if (error) {
        throw error
      }
    },
    [requireClient],
  )

  const requestPasswordReset = useCallback(
    async (email: string, returnTo = '/groups') => {
      const client = requireClient()
      const redirectTo = new URL('/reset-password', window.location.origin)
      redirectTo.searchParams.set('returnTo', safeReturnTo(returnTo))
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectTo.toString(),
      })

      if (error) {
        throw error
      }
    },
    [requireClient],
  )

  const updatePassword = useCallback(
    async (password: string) => {
      const client = requireClient()
      const { error } = await client.auth.updateUser({ password })

      if (error) {
        throw error
      }
    },
    [requireClient],
  )
  const signOut = useCallback(async () => {
    const client = requireClient()
    const { error } = await client.auth.signOut()

    if (error) {
      throw error
    }
  }, [requireClient])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      isConfigured: supabase !== null,
      isLoggedIn: Boolean(session?.user),
      signUp,
      signIn,
      signInWithMagicLink,
      requestPasswordReset,
      updatePassword,
      signOut,
    }),
    [
      loading,
      requestPasswordReset,
      session,
      signIn,
      signInWithMagicLink,
      signOut,
      signUp,
      supabase,
      updatePassword,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
