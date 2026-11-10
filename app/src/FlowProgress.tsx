// The transfer or payout running right now, as a step list: ✓ done (with its
// transaction link), a spinner for the step in progress, · for the rest.
// Shown floating beside the phones on the homepage, and inside the strip.
import { useEffect, useState, type CSSProperties } from 'react'
import { EXPLORER } from './explorer.ts'
import { readProgress, type Progress } from './progress.ts'
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

export function ProgressSteps({ progress }: { progress: Progress }) {
  const done = new Set(progress.steps.map((s) => s.key))
  const current = progress.failed ? undefined : progress.flow.find((f) => !done.has(f.key))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontWeight: 700, color: progress.failed ? '#F28B82' : '#8EE0B4' }}>
        {progress.failed ? progress.title.replace(' in progress', ' failed') : current ? `right now · ${progress.title}` : progress.title.replace(' in progress', ' settled')}
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
          </div>
        )
      })}
    </div>
  )
}

const CARD_W = 380

/**
 * Where a new flow's card goes: just right of the phone where the action
 * happened (MoneyGram for a transfer, Boloka for a payout), a little below its
 * top; bottom-right of the window when that phone isn't on the page.
 */
function anchorFor(progress: Progress): Pos {
  const app = progress.title.startsWith('payout') ? '/home' : '/moneygram'
  const r = document.querySelector(`[data-app="${app}"]`)?.getBoundingClientRect()
  if (r && r.width > 0) return clampPos({ x: r.right + 12, y: r.top + 120 }, CARD_W)
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
  // A new flow re-anchors the card next to its phone (a drag moves it until the next flow).
  const flowId = progress?.id ?? null
  useEffect(() => {
    if (progress) setPos(anchorFor(progress))
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
    <div style={style} data-progress="" data-strip="">
      <div {...handle} title="Drag to move" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'grab', touchAction: 'none', userSelect: 'none', margin: '-10px -12px 0', padding: '10px 12px 4px' }}>
        <span style={{ fontWeight: 700, color: '#8EE0B4', letterSpacing: 0.4 }}>⛓ DEMO · UNDER THE HOOD</span>
        <span style={{ flex: 1, opacity: 0.7 }}>not part of the apps · drag me</span>
        <button type="button" onClick={() => setDismissed(progress.id)} aria-label="Hide" style={{ background: 'transparent', border: 'none', color: '#D7E6DD', cursor: 'pointer', fontFamily: MONO, fontSize: 12, padding: '0 4px' }}>
          ✕
        </button>
      </div>
      <ProgressSteps progress={progress} />
    </div>
  )
}
