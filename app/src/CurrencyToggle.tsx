// The P / $ switch: pula or US dollars for the parents' balances and history.
import type { CSSProperties } from 'react'
import { setCurrency, useCurrency, type Currency } from './currency.ts'

/** `light` is the version for the green balance card. */
export default function CurrencyToggle({ light = false }: { light?: boolean }) {
  const cur = useCurrency()
  const wrap: CSSProperties = {
    display: 'inline-flex',
    padding: 2,
    borderRadius: 999,
    background: light ? 'rgba(255,255,255,0.18)' : '#EEF2EF',
    gap: 2,
  }
  const seg = (c: Currency): CSSProperties => {
    const on = c === cur
    return {
      border: 'none',
      cursor: 'pointer',
      minWidth: 34,
      height: 26,
      padding: '0 10px',
      borderRadius: 999,
      fontSize: 13,
      fontWeight: 700,
      fontFamily: 'inherit',
      background: on ? (light ? '#FFFFFF' : '#0F1412') : 'transparent',
      color: on ? (light ? '#0E7C5B' : '#FFFFFF') : light ? 'rgba(255,255,255,0.85)' : '#5B6660',
      transition: 'background 120ms ease, color 120ms ease',
    }
  }
  return (
    <div role="group" aria-label="Show amounts in" style={wrap}>
      <button type="button" aria-pressed={cur === 'BWP'} title="Pula" style={seg('BWP')} onClick={() => setCurrency('BWP')}>
        P
      </button>
      <button type="button" aria-pressed={cur === 'USD'} title="US dollars" style={seg('USD')} onClick={() => setCurrency('USD')}>
        $
      </button>
    </div>
  )
}
