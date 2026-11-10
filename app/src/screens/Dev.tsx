import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSavings } from '../savings.tsx'
import { TopBar } from '../components.tsx'
import { formatP } from '../money.ts'
import { usePageMeta } from '../ui.tsx'

export default function Dev() {
  usePageMeta('Boloka — Dev')
  const s = useSavings()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function arrive() {
    setBusy(true)
    setError('')
    try {
      const item = await s.arrive()
      navigate('/received', { state: { id: item.id } })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <TopBar title="Dev" />
      <p className="muted">Simulates a transfer from Lerato landing in savings.</p>
      <p className="muted small">Current savings: {formatP(s.balance)}</p>
      <button className="btn primary full" disabled={busy} onClick={arrive}>
        {busy ? 'Arriving…' : 'MoneyGram arrived'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
