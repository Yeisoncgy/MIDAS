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

// Cargar perfil con timeout y reintentos
async function fetchProfile(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<AppUser | null> {
  for (let i = 0; i < 3; i++) {
    try {
      // Timeout de 5 segundos por intento
      const result = await Promise.race([
        supabase
          .from("users")
          .select("*")
          .eq("id", userId)
          .single(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 5000)
        ),
      ])

      if (result.data) {
        console.log("[Auth] Perfil cargado:", result.data.full_name)
        return result.data as AppUser
      }
      console.log(`[Auth] Intento ${i + 1}/3 sin datos:`, result.error?.message)
    } catch (err: any) {
      console.log(`[Auth] Intento ${i + 1}/3 error:`, err.message)
    }

    if (i < 2) await new Promise((r) => setTimeout(r, 500 * (i + 1)))
  }
  return null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Crear cliente DENTRO del efecto para que tenga acceso a cookies
    const supabase = createClient()
    let mounted = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("[Auth] Event:", event, session?.user?.email)

        if (event === "SIGNED_OUT" || !session?.user) {
          if (mounted) {
            setUser(null)
            setLoading(false)
          }
          return
        }

        // Cargar perfil del usuario
        const profile = await fetchProfile(supabase, session.user.id)
        if (mounted) {
          setUser(profile)
          setLoading(false)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const hasPermission = (module: ModuleName): boolean => {
    if (!user) return false
    if (user.role === "admin") return true
    return user.module_permissions?.[module] ?? false
  }

  const isAdmin = user?.role === "admin"

  const logout = async () => {
    const supabase = createClient()
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
