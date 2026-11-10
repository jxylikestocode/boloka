// Drag a fixed-position panel by a handle (pointer events: mouse and touch).
// `key` persists the dropped position in localStorage; null keeps it for the
// session only. `defaultPos` may return null for "no fixed position" (the
// caller then anchors the panel some other way, e.g. to the bottom).
import { useRef, useState, type PointerEvent as RPointerEvent } from 'react'

export type Pos = { x: number; y: number }

export function clampPos(p: Pos, width: number): Pos {
  return {
    x: Math.max(0, Math.min(window.innerWidth - Math.min(width, window.innerWidth - 16), p.x)),
    y: Math.max(0, Math.min(window.innerHeight - 44, p.y)),
  }
}

/**
 * Returns the position, a setter (to re-anchor), the handle's props, and
 * whether the last pointer interaction was a drag rather than a tap. The
 * panel element must carry `data-strip` (the handle may be the panel itself).
 */
export function useDraggable({ key, width, defaultPos }: { key: string | null; width: number; defaultPos: () => Pos | null }) {
  const [pos, setPos] = useState<Pos | null>(() => {
    try {
      const saved = key ? localStorage.getItem(key) : null
      return saved ? clampPos(JSON.parse(saved) as Pos, width) : defaultPos()
    } catch {
      return defaultPos()
    }
  })
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null)
  const lastWasDrag = useRef(false)

  const onPointerDown = (e: RPointerEvent<HTMLElement>) => {
    const r = e.currentTarget.closest('[data-strip]')?.getBoundingClientRect()
    if (!r) return
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false }
    lastWasDrag.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: RPointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d) return
    const next = clampPos({ x: e.clientX - d.dx, y: e.clientY - d.dy }, width)
    if (!d.moved) {
      const r = e.currentTarget.closest('[data-strip]')?.getBoundingClientRect()
      if (r && Math.hypot(next.x - r.left, next.y - r.top) < 4) return
      d.moved = true
    }
    setPos(next)
  }
  const onPointerUp = () => {
    if (drag.current?.moved) {
      lastWasDrag.current = true
      setPos((p) => {
        if (p && key) localStorage.setItem(key, JSON.stringify(p))
        return p
      })
    }
    drag.current = null
  }
  return { pos, setPos, handle: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp }, lastWasDrag }
}
