// The picture on "How it works": dollar coins from family abroad drop into
// one shared pool, interest bubbles up inside it (most of it stays in the
// pool, a small share leaves for Boloka), coins go out to the bank, and a
// private transfer slides from one owner to another inside the water, its
// amount hidden ("?").
// Inline SVG with CSS animation (no image file); still when the person
// prefers reduced motion. Generic: no particular sender.
import { GREEN, INK, MUTED, TINT } from './ui.tsx'
import { YIELD_CUT } from './money.ts'

const USDC_BLUE = '#2775CA'
const WATER = '#BFDCFF'
const WATER_DEEP = '#A9CDF7'
const FONT = 'Inter, system-ui, sans-serif'

const CSS = `
@keyframes help-in { 0% { transform: translate(-70px, -54px) scale(1); opacity: 0 } 12% { opacity: 1 } 78% { transform: translate(0, 0) scale(1); opacity: 1 } 100% { transform: translate(0, 8px) scale(.45); opacity: 0 } }
@keyframes help-splash { 0%, 74% { transform: scale(.2); opacity: 0 } 82% { opacity: .9 } 100% { transform: scale(1.8); opacity: 0 } }
@keyframes help-out { 0% { transform: translate(0, 6px) scale(.45); opacity: 0 } 18% { transform: translate(8px, -14px) scale(1); opacity: 1 } 88% { opacity: 1 } 100% { transform: translate(74px, -56px) scale(1); opacity: 0 } }
@keyframes help-wave { to { transform: translateX(-70px) } }
@keyframes help-rise { 0% { transform: translateY(0) scale(.6); opacity: 0 } 25% { opacity: 1; transform: translateY(-12px) scale(1) } 100% { transform: translateY(-46px) scale(1); opacity: 0 } }
@keyframes help-cut { 0% { transform: translate(0, 0); opacity: 0 } 15% { opacity: 1 } 85% { opacity: 1 } 100% { transform: translate(46px, 66px); opacity: 0 } }
@keyframes help-move { 0% { transform: translate(0, 0); opacity: 0 } 12% { opacity: 1; transform: translate(6px, -3px) } 50% { transform: translate(38px, -8px) } 84% { opacity: 1; transform: translate(70px, -3px) } 100% { transform: translate(76px, 0); opacity: 0 } }
@keyframes help-glow { 0%, 100% { opacity: .35 } 50% { opacity: .9 } }
.help-anim .coin-in { animation: help-in 2.7s ease-in infinite; transform-box: fill-box; transform-origin: center }
.help-anim .splash-in { animation: help-splash 2.7s ease-out infinite; transform-box: fill-box; transform-origin: center }
.help-anim .coin-out { animation: help-out 2.7s ease-out infinite; transform-box: fill-box; transform-origin: center }
.help-anim .wave { animation: help-wave 3.2s linear infinite }
.help-anim .wave.back { animation-duration: 4.6s; animation-direction: reverse }
.help-anim .bubble { animation: help-rise 3s ease-out infinite; transform-box: fill-box; transform-origin: center }
.help-anim .coin-cut { animation: help-cut 3.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center }
.help-anim .coin-move { animation: help-move 4s ease-in-out infinite; transform-box: fill-box; transform-origin: center }
.help-anim .owner-glow { animation: help-glow 4s ease-in-out infinite; transform-box: fill-box; transform-origin: center }
@media (prefers-reduced-motion: reduce) { .help-anim * { animation: none !important } }
`

/** A USDC-style coin centred on (0, 0); `glyph` "?" for a transfer whose amount nobody sees. */
function Coin({ className, delay, glyph = '$' }: { className: string; delay: number; glyph?: string }) {
  return (
    <g className={className} style={{ animationDelay: `${delay}s` }}>
      <circle r="10" fill={USDC_BLUE} />
      <circle r="10" fill="none" stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="1" />
      <text y="4" textAnchor="middle" fontSize="12" fontWeight="700" fill="#FFFFFF" fontFamily={FONT}>{glyph}</text>
    </g>
  )
}

/** A note owner inside the pool: a small person mark centred on (0, 0). */
function Owner({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle className="owner-glow" r="11" fill="#FFFFFF" fillOpacity="0.9" style={{ animationDelay: `${delay}s` }} />
      <circle r="3.2" cy="-2.6" fill={INK} />
      <path d="M-5.5 5.5 a5.5 5.5 0 0 1 11 0 z" fill={INK} />
    </g>
  )
}

/** An interest "+" token centred on (0, 0). */
function Plus({ className, delay, r = 6 }: { className: string; delay: number; r?: number }) {
  return (
    <g className={className} style={{ animationDelay: `${delay}s` }}>
      <circle r={r} fill={GREEN} />
      <text y={r * 0.58} textAnchor="middle" fontSize={r * 1.7} fontWeight="700" fill="#FFFFFF" fontFamily={FONT}>+</text>
    </g>
  )
}

/** The wave outline: from x −70 to 350, so it covers the pool (x 100–240) while scrolling 70px either way. */
const WAVE = 'M-70 0 ' + 'q 17.5 -7 35 0 ' + 't 35 0 '.repeat(11) + 'V 90 H -70 Z'

const pct = (x: number) => `${Math.round(x * 100)}%`

export default function PoolAnimation() {
  return (
    <div style={{ background: TINT, borderRadius: 16, padding: '10px 8px 6px' }}>
      <style>{CSS}</style>
      <svg
        className="help-anim"
        viewBox="0 0 340 214"
        width="100%"
        role="img"
        aria-label={`Dollars from family abroad flow into one shared pool, earn interest there (${pct(1 - YIELD_CUT)} stays in the pool, ${pct(YIELD_CUT)} goes to Boloka), move privately between owners inside the pool, and flow out to the bank as pula`}
      >
        <defs>
          <clipPath id="help-pool-clip">
            <rect x="100" y="78" width="140" height="92" rx="22" />
          </clipPath>
        </defs>

        {/* Where the money comes from and goes to */}
        <text x="52" y="18" textAnchor="middle" fontSize="11" fontWeight="600" fill={INK} fontFamily={FONT}>From family abroad</text>
        <text x="52" y="31" textAnchor="middle" fontSize="10" fill={MUTED} fontFamily={FONT}>arrives as dollars</text>
        <text x="290" y="18" textAnchor="middle" fontSize="11" fontWeight="600" fill={INK} fontFamily={FONT}>To your bank</text>
        <text x="290" y="31" textAnchor="middle" fontSize="10" fill={MUTED} fontFamily={FONT}>paid out in pula</text>
        <text x="170" y="61" textAnchor="middle" fontSize="10.5" fontWeight="600" fill={GREEN} fontFamily={FONT}>Private transfer</text>
        <text x="170" y="73" textAnchor="middle" fontSize="9" fill={MUTED} fontFamily={FONT}>nobody sees who or how much</text>

        {/* The arcs the coins travel */}
        <path d="M58 42 C 80 70, 100 80, 128 92" fill="none" stroke={GREEN} strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="3 4" />
        <path d="M212 92 C 240 80, 260 70, 284 42" fill="none" stroke={GREEN} strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="3 4" />

        {/* The pool */}
        <rect x="100" y="78" width="140" height="92" rx="22" fill="#FFFFFF" stroke={GREEN} strokeWidth="2" />
        <g clipPath="url(#help-pool-clip)">
          <g transform="translate(0 104)">
            <path className="wave back" d={WAVE} fill={WATER_DEEP} />
          </g>
          <g transform="translate(0 108)">
            <path className="wave" d={WAVE} fill={WATER} fillOpacity="0.95" />
          </g>
          {/* A private transfer: a coin slides from one owner to another under the water, amount unseen */}
          <path d="M132 146 Q 170 128 208 146" fill="none" stroke={GREEN} strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="3 4" />
          <Owner x={120} y={148} delay={0} />
          <Owner x={220} y={148} delay={2} />
          <g transform="translate(132 148)">
            <Coin className="coin-move" delay={0.6} glyph="?" />
          </g>
          <text x="170" y="165" textAnchor="middle" fontSize="8.5" fontWeight="700" fill={GREEN} fontFamily={FONT} letterSpacing="0.3">private transfer</text>
          {/* Interest: "+" tokens rising through the water */}
          {[
            [128, 0],
            [150, 1.3],
            [172, 0.6],
            [194, 1.9],
            [216, 2.4],
          ].map(([x, delay]) => (
            <g key={x} transform={`translate(${x} 162)`}>
              <Plus className="bubble" delay={delay} />
            </g>
          ))}
        </g>
        <rect x="100" y="78" width="140" height="92" rx="22" fill="none" stroke={GREEN} strokeWidth="2" />

        {/* Coins dropping in on the left, with a splash */}
        <g transform="translate(130 96)">
          {[0, 0.9, 1.8].map((d) => (
            <ellipse key={d} className="splash-in" style={{ animationDelay: `${d}s` }} rx="12" ry="4" fill="none" stroke={USDC_BLUE} strokeWidth="1.5" />
          ))}
          {[0, 0.9, 1.8].map((d) => (
            <Coin key={d} className="coin-in" delay={d} />
          ))}
        </g>

        {/* Coins leaving on the right */}
        <g transform="translate(210 96)">
          {[0.45, 1.35, 2.25].map((d) => (
            <Coin key={d} className="coin-out" delay={d} />
          ))}
        </g>

        {/* The interest: most stays in the pool, a share goes to Boloka */}
        <text x="12" y="190" fontSize="10.5" fontWeight="600" fill={GREEN} fontFamily={FONT}>Interest from lending on Blend</text>
        <text x="12" y="204" fontSize="10" fill={MUTED} fontFamily={FONT}>{pct(1 - YIELD_CUT)} stays in your savings</text>
        <path d="M228 122 C 248 136, 262 160, 272 186" fill="none" stroke={GREEN} strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="3 4" />
        <g transform="translate(228 122)">
          {[0, 1.8].map((d) => (
            <Plus key={d} className="coin-cut" delay={d} r={5.5} />
          ))}
        </g>
        <g transform="translate(246 184)">
          <rect width="84" height="24" rx="12" fill={GREEN} />
          <text x="42" y="16" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#FFFFFF" fontFamily={FONT}>{pct(YIELD_CUT)} to Boloka</text>
        </g>
      </svg>
    </div>
  )
}
