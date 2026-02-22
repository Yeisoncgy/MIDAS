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
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single()

    if (data) return data as AppUser

    console.warn(
      `[Auth] Intento ${i + 1}/${retries} falló al cargar perfil:`,
      error?.message || "sin datos"
    )

    // Esperar antes de reintentar (200ms, 600ms, 1200ms)
    if (i < retries - 1) {
      await new Promise((r) => setTimeout(r, 200 * (i + 1) * 2))
    }
  }
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
      setUser(profile)
    } else {
      console.error("[Auth] No se pudo cargar el perfil después de todos los reintentos")
    }
    return profile
  }, [supabase])

  useEffect(() => {
    // Carga inicial
    const getUser = async () => {
      try {
        const { data: { user: authUser }, error } = await supabase.auth.getUser()

        if (error) {
          console.error("[Auth] Error obteniendo sesión:", error.message)
        }

        if (authUser) {
          await loadProfile(authUser.id)
        }
      } catch (error) {
        console.error("[Auth] Error inesperado:", error)
      } finally {
        initialLoadDone.current = true
        setLoading(false)
      }
    }

    getUser()

    // Escuchar cambios de autenticación (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Ignorar el evento INITIAL_SESSION si ya hicimos la carga inicial
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
