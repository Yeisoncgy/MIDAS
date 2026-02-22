"use client"

import { createContext, useContext, useEffect, useState, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import type { User as AppUser, ModuleName } from "@/lib/types"

interface AuthContextType {
  user: AppUser | null
  loading: boolean
  hasPermission: (module: ModuleName) => boolean
  isAdmin: boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  hasPermission: () => false,
  isAdmin: false,
  logout: async () => {},
})

// Intentar cargar el perfil con reintentos
async function fetchProfile(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  retries = 3
): Promise<AppUser | null> {
  for (let i = 0; i < retries; i++) {
    console.log(`[Auth] Cargando perfil intento ${i + 1}/${retries} para userId: ${userId}`)
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single()

    console.log(`[Auth] Resultado intento ${i + 1}:`, { data: !!data, error: error?.message })

    if (data) return data as AppUser

    // Esperar antes de reintentar (400ms, 800ms)
    if (i < retries - 1) {
      await new Promise((r) => setTimeout(r, 400 * (i + 1)))
    }
  }
  console.log("[Auth] FALLO: no se pudo cargar perfil despues de todos los reintentos")
  return null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  console.log("===== MIDAS AUTH PROVIDER V2 CARGADO =====")
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const initialLoadDone = useRef(false)

  const loadProfile = useCallback(async (userId: string) => {
    const profile = await fetchProfile(supabase, userId)
    if (profile) {
      console.log("[Auth] Perfil cargado OK:", profile.full_name, profile.role)
      setUser(profile)
    } else {
      console.log("[Auth] ERROR: perfil es null")
    }
    return profile
  }, [supabase])

  useEffect(() => {
    console.log("[Auth] useEffect ejecutado - iniciando carga")

    const getUser = async () => {
      try {
        console.log("[Auth] Llamando supabase.auth.getUser()...")
        const { data: { user: authUser }, error } = await supabase.auth.getUser()

        console.log("[Auth] getUser resultado:", {
          tieneUser: !!authUser,
          userId: authUser?.id,
          email: authUser?.email,
          error: error?.message
        })

        if (authUser) {
          await loadProfile(authUser.id)
        } else {
          console.log("[Auth] No hay usuario autenticado")
        }
      } catch (error) {
        console.log("[Auth] Error inesperado:", error)
      } finally {
        initialLoadDone.current = true
        setLoading(false)
        console.log("[Auth] Carga inicial finalizada")
      }
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("[Auth] onAuthStateChange:", event, !!session?.user)

        if (event === "INITIAL_SESSION" && initialLoadDone.current) return

        if (session?.user) {
          await loadProfile(session.user.id)
        } else {
          setUser(null)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase, loadProfile])

  const hasPermission = (module: ModuleName): boolean => {
    if (!user) return false
    if (user.role === "admin") return true
    return user.module_permissions?.[module] ?? false
  }

  const isAdmin = user?.role === "admin"

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    window.location.href = "/login"
  }

  return (
    <AuthContext.Provider value={{ user, loading, hasPermission, isAdmin, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth debe usarse dentro de un AuthProvider")
  }
  return context
}
