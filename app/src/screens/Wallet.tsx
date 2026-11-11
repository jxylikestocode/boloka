// /wallet: the open Boloka dapp for anyone with a Stellar wallet (a laptop
// frame on the homepage, or its own window). Sign in with Freighter (or a
// test wallet), paste a Boloka ID, give an amount under any name you like:
// the recipient's phone sees the money and the label, nobody sees you. The wallet funds a private pocket in the pool,
// a zero-knowledge transfer moves it on, and Boloka's relayer submits that
// transfer (src/give.ts). The sender's side: jargon is fine here.
import { useEffect, useState, type CSSProperties } from 'react'
import { ensureWalletReady, walletUnits, type Signer } from '../chain.ts'
import { connectFreighter } from '../freighter.ts'
import { EXPLORER } from '../explorer.ts'
import { give, testWallet, type GiveStep } from '../give.ts'
import { pulaToUnits, unitsToPula } from '../money.ts'
import { decodeId, type Recipient } from '../notes.ts'
import { BORDER, FONT, GREEN, INK, LINE, MUTED, PANEL, RED, TINT, amt, button, disabledStyle, usePageMeta } from '../ui.tsx'
import { directory, type DirectoryEntry } from '../wallet.ts'
import { addProgress, clearProgress, failProgress, GIVE_FLOW, startProgress } from '../progress.ts'


const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`
const card: CSSProperties = { background: '#FFFFFF', borderRadius: 18, border: `1px solid ${LINE}`, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }
const label: CSSProperties = { fontSize: 13, fontWeight: 600, color: MUTED }
const input: CSSProperties = { height: 44, borderRadius: 12, border: `1.5px solid ${BORDER}`, padding: '0 12px', font: `500 14px ${FONT}`, color: INK, background: '#FFFFFF', outline: 'none', width: '100%', boxSizing: 'border-box' }

function friendly(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (/declin|reject|denied|cancel/i.test(m)) return 'Cancelled in the wallet.'
  if (/trustline|not found|op_no_trust|balance/i.test(m) && /USDC|balance/i.test(m)) return `${m} Your wallet needs the pool's testnet USDC: tap "Get test dollars".`
  return m
}

export default function Wallet() {
  usePageMeta('Boloka — Send from your wallet')
  const [signer, setSigner] = useState<Signer | null>(null)
  const [mode, setMode] = useState<'freighter' | 'test' | null>(null)
  const [units, setUnits] = useState<bigint | null>(null)
  const [contacts, setContacts] = useState<DirectoryEntry[]>([])
  const [idText, setIdText] = useState('')
  const [name, setName] = useState('A friend')
  const [text, setText] = useState('1,000.00')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [steps, setSteps] = useState<GiveStep[]>([])
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    directory().then(setContacts)
  }, [])

  const refreshBalance = async (s: Signer) => setUnits(await walletUnits(s.address).catch(() => 0n))
  useEffect(() => {
    if (!signer) return
    void refreshBalance(signer)
    const t = setInterval(() => void refreshBalance(signer), 5000)
    return () => clearInterval(t)
  }, [signer])

  async function connect(kind: 'freighter' | 'test') {
    setError('')
    try {
      setStatus(kind === 'freighter' ? 'Approve in Freighter…' : 'Making a test wallet…')
      const s = kind === 'freighter' ? await connectFreighter() : testWallet()
      setStatus('Checking the wallet on testnet…')
      const added = await ensureWalletReady(s)
      setSigner(s)
      setMode(kind)
      setStatus(added ? 'Trustline to USDC added.' : '')
    } catch (e) {
      setError(friendly(e))
      setStatus('')
    }
  }

  async function faucet() {
    if (!signer) return
    setError('')
    setStatus('Asking the testnet float for test dollars…')
    try {
      const r = await fetch('/api/faucet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: signer.address }) })
      if (!r.ok) throw new Error(await r.text())
      const { amount } = (await r.json()) as { amount: string }
      setStatus(`${amount} USDC received (P ${amt(unitsToPula(BigInt(Math.round(Number(amount) * 1e7))))} on screen).`)
      await refreshBalance(signer)
    } catch (e) {
      setError(friendly(e))
      setStatus('')
    }
  }

  const recipient: Recipient | null = decodeId(idText)
  const pula = Number(text.replace(/,/g, '')) || 0
  const need = pulaToUnits(pula)
  const over = units !== null && need > units
  const canSend = !!signer && !!recipient && pula > 0 && !over && !busy

  async function send() {
    if (!signer || !recipient) return
    setBusy(true)
    setError('')
    setSteps([])
    setDone(null)
    // The homepage's status pill follows this too (same origin).
    startProgress('giving in progress', GIVE_FLOW, [], '/wallet')
    try {
      const tx = await give(signer, recipient, need, name.trim() || 'A friend', (s) => {
        setSteps((prev) => [...prev, s])
        addProgress({ key: s.key, title: s.title, kind: s.key === 'proof' ? 'offchain' : 'real', tx: s.tx, note: s.note })
      })
      setDone(tx)
      await refreshBalance(signer)
    } catch (e) {
      setError(friendly(e))
      if (steps.length === 0) clearProgress()
      else failProgress(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: PANEL, fontFamily: FONT, color: INK }}>
      <div style={{ background: '#FFFFFF', borderBottom: `1px solid ${LINE}`, padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: GREEN, color: '#FFFFFF', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>B</div>
        <div style={{ fontWeight: 700, fontSize: 17 }}>Boloka dapp</div>
        <span style={{ fontSize: 12, fontWeight: 600, color: MUTED, background: PANEL, borderRadius: 999, padding: '4px 10px' }}>Permissionless · any Stellar wallet · testnet</span>
        <span style={{ flex: 1 }} />
        {signer && (
          <span style={{ fontSize: 13, color: MUTED }}>
            Signed in with {mode === 'freighter' ? 'Freighter' : 'a test wallet'} · <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{short(signer.address)}</span>
            {units !== null && <> · <strong style={{ color: INK }}>P {amt(unitsToPula(units))}</strong> in USDC</>}
          </span>
        )}
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '28px 20px 60px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {!signer ? (
          <div style={card}>
            <div style={{ fontWeight: 700 }}>1 · Sign in with your wallet</div>
            <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>Permissionless: any Stellar wallet works, nothing to register. Freighter on Testnet; no Freighter? A test wallet lives in this browser and gets test dollars from the demo.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" style={{ ...button.green, flex: 1 }} onClick={() => connect('freighter')}>Connect Freighter</button>
              <button type="button" style={{ ...button.outline, flex: 1 }} onClick={() => connect('test')}>Use a test wallet</button>
            </div>
            {status && <div style={{ fontSize: 13, color: MUTED }}>{status}</div>}
            {error && <div style={{ fontSize: 13, color: RED, fontWeight: 600 }}>{error}</div>}
          </div>
        ) : (
          <>
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontWeight: 700, flex: 1 }}>1 · Your wallet</div>
                <button type="button" style={{ ...button.outline, height: 36, padding: '0 14px', fontSize: 13, width: 'auto' }} onClick={faucet} disabled={busy}>Get test dollars</button>
              </div>
              <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
                <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{signer.address}</span>
                <br />
                Holds <strong style={{ color: INK }}>P {units === null ? '…' : amt(unitsToPula(units))}</strong> of the pool's USDC (shown at the demo's 1:1000 scale).
                {mode === 'test' && ' A test wallet made in this browser; "Get test dollars" pays it 1 USDC from the demo float.'}
              </div>
            </div>

            <div style={card}>
              <div style={{ fontWeight: 700 }}>2 · Whom, how much, and as whom</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={label}>Their Boloka ID (in their Boloka app, Settings)</div>
                {contacts.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {contacts.map((c) => (
                      <button key={c.profile} type="button" onClick={() => setIdText(c.id)} style={{ border: `1.5px solid ${idText === c.id ? GREEN : BORDER}`, background: idText === c.id ? TINT : '#FFFFFF', borderRadius: 999, padding: '6px 12px', font: `600 13px ${FONT}`, color: INK, cursor: 'pointer' }}>
                        {c.name} (demo)
                      </button>
                    ))}
                  </div>
                )}
                <input type="text" value={idText} onChange={(e) => setIdText(e.target.value)} placeholder="BLK…" spellCheck={false} style={{ ...input, borderColor: idText && !recipient ? RED : BORDER, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={label}>Amount in pula</div>
                  <input type="text" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ''))} onBlur={() => pula > 0 && setText(amt(pula))} style={{ ...input, fontSize: 18, fontWeight: 700 }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={label}>Shown to them as</div>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value.slice(0, 18))} placeholder="A friend" style={input} />
                </div>
              </div>
              <div style={{ fontSize: 13, color: over ? RED : MUTED }}>
                {over ? 'More than your wallet holds.' : 'No fee. It arrives in their savings in dollars, in about half a minute.'}
              </div>
              <button type="button" style={{ ...button.green, width: '100%', ...(canSend ? {} : disabledStyle) }} disabled={!canSend} onClick={send}>
                {busy ? 'Sending…' : `Give P ${amt(pula)}${recipient ? '' : ' · paste a Boloka ID first'}`}
              </button>
              {status && !busy && <div style={{ fontSize: 13, color: MUTED }}>{status}</div>}
              {error && <div style={{ fontSize: 13, color: RED, fontWeight: 600 }}>{error}</div>}
            </div>

            {(steps.length > 0 || busy) && (
              <div style={card}>
                <div style={{ fontWeight: 700 }}>{done ? 'Done. Nobody can tell it was you.' : 'Sending…'}</div>
                {[
                  ['deposit', 'Your wallet funds a private pocket in the pool (you sign this one)'],
                  ['proof', 'A zero-knowledge proof is made on this device'],
                  ['relay', 'Boloka’s relayer submits the transfer from its own account'],
                ].map(([key, text]) => {
                  const s = steps.find((x) => x.key === key)
                  const running = !s && !done && steps.length === ['deposit', 'proof', 'relay'].indexOf(key)
                  return (
                    <div key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, opacity: s || running ? 1 : 0.5 }}>
                      <span style={{ width: 16, color: s ? GREEN : MUTED, flex: 'none' }}>{s ? '✓' : running ? '…' : '·'}</span>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div>{s ? s.title : text}</div>
                        {s?.note && <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.45 }}>{s.note}</div>}
                        {s?.tx && (
                          <a href={`${EXPLORER}/transactions/${s.tx}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: GREEN, fontFamily: 'ui-monospace, Menlo, monospace', textDecoration: 'none' }}>
                            {s.tx.slice(0, 8)}… on the explorer ↗
                          </a>
                        )}
                      </div>
                      {s && <span style={{ fontSize: 12, color: MUTED, flex: 'none' }}>{(s.ms / 1000).toFixed(1)} s</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
          What stays visible: that your wallet paid the pool, and the amount of that deposit. What nobody can connect: that deposit to the transfer, or the transfer to the person you gave to. For the best cover, use a wallet funded for this, and give a while after funding it.
          {' '}<a href="/how-it-works" style={{ color: GREEN, fontWeight: 600, textDecoration: 'none' }}>How it works →</a>
        </div>
      </div>
    </div>
  )
}
