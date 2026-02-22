"use client"

import { createContext, useContext, useEffect, useState } from "react"
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

// Cliente singleton fuera del componente
const supabase = createClient()

// Cargar perfil con reintentos
async function fetchProfile(userId: string): Promise<AppUser | null> {
  for (let i = 0; i < 3; i++) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single()

    if (data) return data as AppUser
    console.log(`[Auth] Intento ${i + 1}/3 fallo:`, error?.message)
    if (i < 2) await new Promise((r) => setTimeout(r, 500 * (i + 1)))
  }
  return null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    console.log("[Auth] Iniciando carga de sesion...")
    let mounted = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("[Auth] AuthStateChange:", event, session?.user?.email)

        if (event === "SIGNED_OUT") {
          setUser(null)
          if (mounted) setLoading(false)
          return
        }

        if (session?.user) {
          const profile = await fetchProfile(session.user.id)
          if (profile && mounted) {
            console.log("[Auth] Perfil cargado:", profile.full_name)
            setUser(profile)
          }
        }

        if (mounted) setLoading(false)
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, []) // Sin dependencias — supabase es singleton fuera del componente

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
