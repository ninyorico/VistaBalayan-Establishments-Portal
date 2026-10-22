import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import { isActiveEstablishmentStaff } from '../lib/accessControl'

interface Profile {
  id: string
  email: string
  full_name: string
  role: 'municipal_officer' | 'establishment_staff'
  establishment_id: string | null
  establishment_status?: string | null
  status?: string
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<Profile | null>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const loadProfile = async (userId: string): Promise<Profile | null> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('Profile fetch error:', error)
    return null
  }

  const nextProfile = data as Profile | null
  if (!nextProfile || nextProfile.status === 'inactive' || nextProfile.status === 'deleted') {
    return null
  }

  if (nextProfile.role === 'establishment_staff') {
    if (!nextProfile.establishment_id) return null

    const { data: establishment, error: establishmentError } = await supabase
      .from('establishments')
      .select('status')
      .eq('id', nextProfile.establishment_id)
      .maybeSingle()

    if (establishmentError) {
      console.error('Establishment access check error:', establishmentError)
      return null
    }

    const establishmentStatus = establishment?.status || null
    if (!isActiveEstablishmentStaff({
      role: nextProfile.role,
      status: nextProfile.status,
      establishmentStatus,
      establishmentId: nextProfile.establishment_id,
    })) {
      return null
    }

    return { ...nextProfile, establishment_status: establishmentStatus }
  }

  return nextProfile
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const profileRef = useRef<Profile | null>(null)

  const updateProfile = (nextProfile: Profile | null) => {
    profileRef.current = nextProfile
    setProfile(nextProfile)
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    profileRef.current = null
    setProfile(null)
    setUser(null)
  }

  const refreshProfile = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) {
      updateProfile(null)
      setUser(null)
      return null
    }

    const nextProfile = await loadProfile(currentUser.id)
    if (!nextProfile) {
      updateProfile(null)
      setUser(null)
      await supabase.auth.signOut()
      return null
    }

    setUser(currentUser)
    updateProfile(nextProfile)
    return nextProfile
  }

  useEffect(() => {
    let mounted = true

    const fetchProfile = async (userId: string) => {
      const nextProfile = await loadProfile(userId)
      if (!mounted) return

      if (!nextProfile) {
        updateProfile(null)
        setUser(null)
        await supabase.auth.signOut()
        return
      }

      updateProfile(nextProfile)
    }

    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted) return

      setUser(session?.user ?? null)
      if (session?.user) {
        await fetchProfile(session.user.id)
      } else {
        updateProfile(null)
      }
      if (mounted) setLoading(false)
    }

    void checkSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user ?? null
      setUser(nextUser)

      if (!nextUser) {
        updateProfile(null)
        setLoading(false)
        return
      }

      const hasCurrentProfile = Boolean(profileRef.current)
      const sameProfileUser = profileRef.current?.id === nextUser.id
      const shouldSilentlyKeepUi =
        hasCurrentProfile && sameProfileUser && (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')

      if (shouldSilentlyKeepUi) {
        setLoading(false)
        return
      }

      setLoading(!hasCurrentProfile)
      setTimeout(async () => {
        await fetchProfile(nextUser.id)
        if (mounted) setLoading(false)
      }, 0)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error

    const nextProfile = await loadProfile(data.user.id)
    if (!nextProfile) {
      await supabase.auth.signOut()
      throw new Error('This account or its linked establishment is not active')
    }
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}