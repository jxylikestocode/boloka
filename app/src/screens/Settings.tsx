// The gear on Home. For an account that lives on this phone, settings are
// mostly about not losing the money and where it goes: back up & recovery,
// security, payout accounts, display, notifications, privacy & about.
// Parents' screen: plain words, no crypto terms.
import { useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { DESTINATIONS, type Destination } from '../money.ts'
import { updateSettings, useSettings, type Settings as S } from '../settings.ts'
import CurrencyToggle from '../CurrencyToggle.tsx'
import { useCurrency } from '../currency.ts'
import { BORDER, GREEN, INK, LINE, MUTED, PANEL, TINT, BackHeader, Frame, button, sectionLabel, usePageMeta, when } from '../ui.tsx'

const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: `1px solid ${LINE}`, fontSize: 14 }

function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={sectionLabel}>{title}</div>
      <div style={{ background: PANEL, borderRadius: 16, padding: '2px 16px' }}>{children}</div>
      {note && <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, padding: '0 4px' }}>{note}</div>}
    </div>
  )
}

function Line({ label, sub, right, last, onClick }: { label: ReactNode; sub?: ReactNode; right?: ReactNode; last?: boolean; onClick?: () => void }) {
  return (
    <div role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick} onKeyDown={(e) => onClick && e.key === 'Enter' && onClick()} style={{ ...rowStyle, borderBottom: last ? undefined : rowStyle.borderBottom, cursor: onClick ? 'pointer' : undefined }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontWeight: 600, color: INK }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: MUTED }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} style={{ width: 46, height: 28, borderRadius: 999, border: 'none', padding: 2, background: on ? GREEN : BORDER, cursor: 'pointer', flex: 'none', transition: 'background 140ms ease' }}>
      <span style={{ display: 'block', width: 24, height: 24, borderRadius: '50%', background: '#FFFFFF', transform: `translateX(${on ? 18 : 0}px)`, transition: 'transform 140ms ease', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
    </button>
  )
}

function Chevron() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

function LinkLine({ to, label, sub, last }: { to: string; label: string; sub?: string; last?: boolean }) {
  return (
    <Link to={to} style={{ ...rowStyle, borderBottom: last ? undefined : rowStyle.borderBottom, textDecoration: 'none', color: INK }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: MUTED }}>{sub}</div>}
      </div>
      <Chevron />
    </Link>
  )
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'inline-flex', padding: 2, borderRadius: 999, background: '#EEF2EF', gap: 2, flex: 'none' }}>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)} style={{ border: 'none', cursor: 'pointer', height: 26, padding: '0 11px', borderRadius: 999, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', background: v === value ? '#0F1412' : 'transparent', color: v === value ? '#FFFFFF' : '#5B6660' }}>
          {text}
        </button>
      ))}
    </div>
  )
}

const Chip = ({ children }: { children: ReactNode }) => (
  <span style={{ fontSize: 11, fontWeight: 700, color: GREEN, background: TINT, borderRadius: 999, padding: '3px 8px', flex: 'none' }}>{children}</span>
)

export default function Settings() {
  usePageMeta('Boloka — Settings')
  const s = useSettings()
  const cur = useCurrency()
  const [justBacked, setJustBacked] = useState(false)
  const set = (patch: Partial<S>) => updateSettings(patch)
  const payout = (d: Destination) => DESTINATIONS[d]

  return (
    <Frame gap={22}>
      <BackHeader title="Settings" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: GREEN, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 20 }}>M</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Mom</div>
          <div style={{ fontSize: 13, color: MUTED }}>+267 71 234 567 · Gaborone</div>
        </div>
      </div>

      <Section
        title="Back up & recovery"
        note="Your savings can only be opened from this phone. Your trusted people can restore them together on a new phone; neither can see or move your money alone."
      >
        <Line label="Trusted people" sub={s.trusted.join(' · ')} right={<Chip>{s.trusted.length} of 2</Chip>} />
        <Line
          label="Backed up"
          sub={s.backupAt ? `${when(s.backupAt)}${justBacked ? ' · done' : ''}` : 'Not yet'}
          right={
            <button
              type="button"
              onClick={() => {
                set({ backupAt: new Date().toISOString() })
                setJustBacked(true)
              }}
              style={{ ...button.outline, height: 36, padding: '0 14px', fontSize: 13, width: 'auto', flex: 'none' }}
            >
              Back up now
            </button>
          }
          last
        />
      </Section>

      <Section title="Security">
        <Line label="Lock with PIN or Face ID" sub="Needed to open the app" right={<Toggle on={s.pin} onChange={(v) => set({ pin: v })} label="Lock with PIN or Face ID" />} />
        <Line label="Ask before every withdrawal" sub="One more confirmation before money leaves" right={<Toggle on={s.confirmWithdraw} onChange={(v) => set({ confirmWithdraw: v })} label="Ask before every withdrawal" />} last />
      </Section>

      <Section title="Payout accounts" note="Where Withdraw goes unless you choose otherwise on the screen. Tap one to make it the default.">
        {(['bank', 'orange'] as Destination[]).map((d, i, all) => (
          <Line
            key={d}
            label={payout(d).name}
            sub={payout(d).account}
            right={s.payoutDefault === d ? <Chip>Default</Chip> : <span style={{ fontSize: 13, fontWeight: 600, color: GREEN }}>Make default</span>}
            onClick={() => set({ payoutDefault: d })}
            last={i === all.length - 1}
          />
        ))}
      </Section>

      <Section title="Display" note={s.language === 'tn' ? 'Setswana is on its way; the app stays in English until then.' : undefined}>
        <Line label="Show amounts in" sub={cur === 'USD' ? 'US dollars' : 'Pula'} right={<CurrencyToggle />} />
        <Line label="Language" right={<Segmented value={s.language} options={[['en', 'English'], ['tn', 'Setswana']]} onChange={(v) => set({ language: v })} label="Language" />} last />
      </Section>

      <Section title="Notifications">
        <Line label="When money arrives" right={<Toggle on={s.notifyArrive} onChange={(v) => set({ notifyArrive: v })} label="When money arrives" />} />
        <Line label="When a payout lands" right={<Toggle on={s.notifyPayout} onChange={(v) => set({ notifyPayout: v })} label="When a payout lands" />} />
        <Line label="Monthly summary" sub="What came in, what grew, what went out" right={<Toggle on={s.notifyMonthly} onChange={(v) => set({ notifyMonthly: v })} label="Monthly summary" />} last />
      </Section>

      <Section title="Privacy & about">
        <LinkLine to="/private" label="Nobody can look up your savings" sub="What is hidden, and from whom" />
        <LinkLine to="/prove" label="Show a lender" sub="Prove one fact, share nothing else" />
        <LinkLine to="/help" label="How Boloka works" sub="Dollars, the pool, the interest, our share" />
        <Line label="Version" right={<span style={{ fontSize: 13, color: MUTED }}>Testnet demo</span>} last />
      </Section>

      <div style={{ fontSize: 12, color: MUTED, textAlign: 'center', lineHeight: 1.5, paddingBottom: 4 }}>Boloka never sells or shares your information.</div>
    </Frame>
  )
}
