import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'

// Central GSAP entry point. Importing `gsap` at module scope is SSR-safe — it
// touches no DOM until a tween runs — and `useGSAP` is a client-only layout
// effect (a no-op on the server). Register once here so callers just import.
gsap.registerPlugin(useGSAP)

export { gsap, useGSAP }

// True only in a browser where the user has not asked to reduce motion.
// Returns false during SSR so server renders never assume animation.
export function prefersMotion(): boolean {
  if (typeof window === 'undefined') return false
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Tween an integer from `from` to `to`, pushing each whole-number step to
// `onUpdate`. With reduced motion (or a no-op delta) it jumps straight to the
// final value. Call inside a `useGSAP` scope so the tween is auto-reverted.
export function countUp(from: number, to: number, onUpdate: (value: number) => void): void {
  if (from === to || !prefersMotion()) {
    onUpdate(to)
    return
  }
  const proxy = { value: from }
  gsap.to(proxy, {
    value: to,
    duration: 0.6,
    ease: 'power2.out',
    snap: { value: 1 },
    onUpdate: () => onUpdate(proxy.value),
  })
}
