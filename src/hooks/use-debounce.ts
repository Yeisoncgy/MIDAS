"use client"

import { useEffect, useState } from "react"

/**
 * Devuelve una versión retardada de `value`. Evita filtrar/consultar en cada
 * tecla. Por defecto 250ms.
 */
export function useDebounce<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}
