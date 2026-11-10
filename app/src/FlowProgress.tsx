// The transfer or payout running right now, as a step list: ✓ done (with its
// transaction link), a spinner for the step in progress, · for the rest.
// Shown floating beside the phones on the homepage, and inside the strip.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { EXPLORER } from './explorer.ts'
import { fmtDuration, readProgress, stepDurations, type Progress } from './progress.ts'
import { clampPos, useDraggable, type Pos } from './useDraggable.ts'

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

/**
 * Where a new flow's card goes: just ABOVE the phone where the action happened
 * (MoneyGram for a transfer, Boloka for a payout), over the page's headline,
 * aligned to that phone's left edge. Never beside it: the phone to its right
 * is where the effect shows (the money arriving, the bank credit), and the
 * card must not cover it. Bottom-right of the window when that phone isn't
 * on the page.
 */
function anchorFor(progress: Progress, cardHeight = 150): Pos {
  const app = progress.title.startsWith('payout') ? '/home' : '/moneygram'
  const r = document.querySelector(`[data-app="${app}"]`)?.getBoundingClientRect()
  // Kept within the phone's own columns: a phone narrower than the card gets the card right-aligned.
  if (r && r.width > 0) return clampPos({ x: Math.max(0, Math.min(r.left, r.right - CARD_W)), y: Math.max(0, r.top - cardHeight - 10) }, CARD_W)
  return clampPos({ x: window.innerWidth - CARD_W - 16, y: window.innerHeight - 200 }, CARD_W)
}

/**
 * Floats next to the app being used while a transfer or payout runs, so the
 * steps are seen without scrolling to the strip. Draggable by its title bar,
 * slightly see-through, and in the same console look as the strip: clearly
 * not part of the apps.
 */
export default function FloatingProgress() {
  const progress = useProgress()
  const [dismissed, setDismissed] = useState<number | null>(null)
  const { pos, setPos, handle } = useDraggable({ key: null, width: CARD_W, defaultPos: () => null })
  const ref = useRef<HTMLDivElement>(null)
  // A new flow re-anchors the card above its phone, using the card's real
  // height once rendered (a drag moves it until the next flow).
  const flowId = progress?.id ?? null
  useEffect(() => {
    if (progress) setPos(anchorFor(progress, ref.current?.getBoundingClientRect().height))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId])
  if (!progress || dismissed === progress.id) return null
  const at = pos ?? anchorFor(progress)
  const style: CSSProperties = {
    position: 'fixed',
    left: at.x,
    top: at.y,
    zIndex: 60,
    width: CARD_W,
    padding: '10px 12px',
    fontFamily: MONO,
    fontSize: 11,
    color: '#D7E6DD',
    background: 'rgba(12, 18, 16, 0.78)',
    border: '1px dashed rgba(120, 220, 170, 0.55)',
    borderRadius: 10,
    boxShadow: '0 8px 28px rgba(0,0,0,0.3)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    animation: 'arrival-in 320ms ease-out',
  }
  return (
    <div ref={ref} style={style} data-progress="" data-strip="">
      <div {...handle} title="Drag to move" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'grab', touchAction: 'none', userSelect: 'none', margin: '-10px -12px 0', padding: '10px 12px 4px' }}>
        <span style={{ fontWeight: 700, color: '#8EE0B4', letterSpacing: 0.4 }}>⛓ DEMO · UNDER THE HOOD</span>
        <span style={{ flex: 1, opacity: 0.7 }}>drag me</span>
        <button type="button" onClick={() => setDismissed(progress.id)} aria-label="Hide" style={{ background: 'transparent', border: 'none', color: '#D7E6DD', cursor: 'pointer', fontFamily: MONO, fontSize: 12, padding: '0 4px' }}>
          ✕
        </button>
      </div>
      <ProgressSteps progress={progress} />
    </div>
  )
}
