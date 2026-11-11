// The transfer, send or payout running right now, as a step list: ✓ done (with
// its transaction link), a spinner for the step in progress, · for the rest.
// Shown as a status pill on the homepage (opening into the list) and inside
// the apps' under-the-hood overlay.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { EXPLORER } from './explorer.ts'
import { fmtDuration, readProgress, stepDurations, type Progress } from './progress.ts'
import { useDraggable } from './useDraggable.ts'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

export function useProgress(): Progress | null {
  const [progress, setProgress] = useState<Progress | null>(readProgress)
  useEffect(() => {
    const refresh = () => setProgress(readProgress())
    window.addEventListener('storage', refresh)
    const t = setInterval(refresh, 2000)
    return () => {
      window.removeEventListener('storage', refresh)
      clearInterval(t)
    }
  }, [])
  return progress
}

/** Re-renders four times a second while a step is running, for the live timers. */
function useTicker(running: boolean) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setTick((n) => n + 1), 250)
    return () => clearInterval(t)
  }, [running])
}

export function ProgressSteps({ progress }: { progress: Progress }) {
  const done = new Set(progress.steps.map((s) => s.key))
  const current = progress.failed ? undefined : progress.flow.find((f) => !done.has(f.key))
  useTicker(!!current)
  // Timers: each landed step shows how long it took (since the previous
  // landing); the running step counts up live; the title carries the total.
  const { byKey, lastDone } = stepDurations(progress)
  const total = current ? Date.now() - progress.id : lastDone - progress.id
  const timer: CSSProperties = { flex: 'none', minWidth: 46, textAlign: 'right', opacity: 0.8, fontVariantNumeric: 'tabular-nums' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 8, fontWeight: 700, color: progress.failed ? '#F28B82' : '#8EE0B4' }}>
        <span style={{ flex: 1 }}>
          {progress.failed ? progress.title.replace(' in progress', ' failed') : current ? `right now · ${progress.title}` : progress.title.replace(' in progress', ' settled')}
        </span>
        <span style={{ ...timer, opacity: 1 }} title="Total time since the tap">{fmtDuration(total)}</span>
      </div>
      {progress.failed && <div style={{ color: '#F28B82' }}>✕ {progress.failed}</div>}
      {progress.flow.map((f) => {
        const s = progress.steps.find((x) => x.key === f.key)
        const now = f === current
        return (
          <div key={f.key} style={{ display: 'flex', gap: 8, opacity: s || now ? 1 : 0.5, lineHeight: 1.4 }}>
            <span style={{ width: 12, flex: 'none', color: s?.kind === 'failed' ? '#F28B82' : s ? '#8EE0B4' : '#F0B96B', display: 'inline-flex', justifyContent: 'center', paddingTop: 2 }}>
              {s?.kind === 'failed' ? '✕' : s ? '✓' : now ? <span aria-label="in progress" style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', border: '2px solid #F0B96B', borderRightColor: 'transparent', animation: 'strip-spin 0.8s linear infinite' }} /> : '·'}
            </span>
            <span style={{ flex: 1 }}>
              {f.label}
              {now ? '…' : ''}
              {s?.kind === 'simulated' ? ' · simulated at this scale' : ''}
              {s?.kind === 'failed' ? <span style={{ color: '#F28B82' }}> · did not complete{s.note ? `: ${s.note}` : ''}</span> : ''}
            </span>
            {s?.tx && (
              <a href={`${EXPLORER}/transactions/${s.tx}`} target="_blank" rel="noreferrer" style={{ color: '#8EE0B4', textDecoration: 'none', flex: 'none' }}>
                {s.tx.slice(0, 6)}… ↗
              </a>
            )}
            {s?.doneAt && byKey.has(f.key) ? (
              <span style={timer} title="Time this step took">{fmtDuration(byKey.get(f.key)!)}</span>
            ) : now ? (
              <span style={{ ...timer, color: '#F0B96B' }} title="Running for">{fmtDuration(Date.now() - lastDone)}</span>
            ) : (
              <span style={timer} />
            )}
          </div>
        )
      })}
    </div>
  )
}

const CARD_W = 380

const consoleLook: CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  color: '#D7E6DD',
  background: 'rgba(12, 18, 16, 0.82)',
  border: '1px dashed rgba(120, 220, 170, 0.55)',
  boxShadow: '0 8px 28px rgba(0,0,0,0.3)',
  backdropFilter: 'blur(6px)',
}

/**
 * The transfer, send or payout running right now, as a one-line status pill
 * in the bottom-right corner of the window: "transfer in progress · 2/4 ·
 * 6.3 s". A click opens the full step list (with its transaction links and
 * timers), which can be dragged anywhere; the pill is the default so the
 * phones stay uncovered. In the same console look as the strip: clearly not
 * part of the apps.
 */
export default function FloatingProgress() {
  const progress = useProgress()
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<number | null>(null)
  const { pos, setPos, handle, lastWasDrag } = useDraggable({ key: null, width: CARD_W, defaultPos: () => null })
  const ref = useRef<HTMLDivElement>(null)
  // A new flow starts collapsed, back in the corner.
  const flowId = progress?.id ?? null
  useEffect(() => {
    setOpen(false)
    setPos(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId])
  const done = progress ? new Set(progress.steps.map((s) => s.key)) : new Set<string>()
  const current = progress && !progress.failed ? progress.flow.find((f) => !done.has(f.key)) : undefined
  useTicker(!!current && !open)
  if (!progress || dismissed === progress.id) return null

  const { lastDone } = stepDurations(progress)
  const total = current ? Date.now() - progress.id : lastDone - progress.id
  const landed = progress.flow.filter((f) => done.has(f.key)).length
  const state = progress.failed ? 'failed' : current ? 'running' : 'settled'
  const tone = state === 'failed' ? '#F28B82' : state === 'settled' ? '#8EE0B4' : '#F0B96B'
  const title = progress.title.replace(' in progress', '')

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Show every step with its transaction"
        data-progress-pill=""
        style={{ ...consoleLook, position: 'fixed', right: 16, bottom: 16, zIndex: 60, borderRadius: 999, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', animation: 'fade-down 260ms ease-out' }}
      >
        <span style={{ color: tone, fontWeight: 700 }}>
          {state === 'running' ? (
            <span aria-label="in progress" style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', border: `2px solid ${tone}`, borderRightColor: 'transparent', animation: 'strip-spin 0.8s linear infinite', verticalAlign: '-1px' }} />
          ) : state === 'settled' ? (
            '✓'
          ) : (
            '✕'
          )}
        </span>
        <span style={{ fontWeight: 700, color: '#D7E6DD' }}>{title}</span>
        <span style={{ opacity: 0.75 }}>
          {state === 'running' ? 'in progress' : state} · {landed}/{progress.flow.length} · {fmtDuration(total)}
        </span>
        <span style={{ color: '#8EE0B4' }}>under the hood ▸</span>
      </button>
    )
  }

  // Open: bottom-right until dragged.
  const placement: CSSProperties = pos ? { left: pos.x, top: pos.y } : { right: 16, bottom: 16 }
  return (
    <div ref={ref} style={{ ...consoleLook, ...placement, position: 'fixed', zIndex: 60, width: CARD_W, padding: '10px 12px', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 6, animation: 'fade-down 240ms ease-out' }} data-progress="" data-strip="">
      <div {...handle} title="Drag to move" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'grab', touchAction: 'none', userSelect: 'none', margin: '-10px -12px 0', padding: '10px 12px 4px' }}>
        <span style={{ fontWeight: 700, color: '#8EE0B4', letterSpacing: 0.4 }}>⛓ DEMO · UNDER THE HOOD</span>
        <span style={{ flex: 1, opacity: 0.7 }}>drag me</span>
        <button type="button" onClick={() => !lastWasDrag.current && setOpen(false)} aria-label="Collapse" title="Back to the status pill" style={{ background: 'transparent', border: 'none', color: '#D7E6DD', cursor: 'pointer', fontFamily: MONO, fontSize: 12, padding: '0 4px' }}>
          ▾
        </button>
        <button type="button" onClick={() => setDismissed(progress.id)} aria-label="Hide" style={{ background: 'transparent', border: 'none', color: '#D7E6DD', cursor: 'pointer', fontFamily: MONO, fontSize: 12, padding: '0 4px' }}>
          ✕
        </button>
      </div>
      <ProgressSteps progress={progress} />
    </div>
  )
}
