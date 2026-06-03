"use client"

import { useCallback, useEffect, useState } from "react"

const FAV_KEY = "midas:sidebar:favorites"
const COLLAPSED_KEY = "midas:sidebar:collapsed"

/** Lee un valor de localStorage de forma segura (SSR-safe). */
function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

/**
 * Maneja las preferencias persistentes del sidebar: estado colapsado
 * y módulos favoritos (anclados). Persiste en localStorage.
 */
export function useSidebarPrefs() {
  const [favorites, setFavorites] = useState<string[]>([])
  const [collapsed, setCollapsedState] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // Hidratar desde localStorage tras el montaje (evita mismatch SSR)
  useEffect(() => {
    setFavorites(readLS<string[]>(FAV_KEY, []))
    setCollapsedState(readLS<boolean>(COLLAPSED_KEY, false))
    setHydrated(true)
  }, [])

  const toggleFavorite = useCallback((href: string) => {
    setFavorites((prev) => {
      const next = prev.includes(href)
        ? prev.filter((h) => h !== href)
        : [...prev, href]
      try {
        window.localStorage.setItem(FAV_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }, [])

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value)
    try {
      window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(value))
    } catch {}
  }, [])

  const isFavorite = useCallback(
    (href: string) => favorites.includes(href),
    [favorites]
  )

  return {
    favorites,
    isFavorite,
    toggleFavorite,
    collapsed,
    setCollapsed,
    hydrated,
  }
}
