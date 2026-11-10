// The picture on "How it works": dollar coins drop into one shared pool,
// interest bubbles up inside it, and coins leave towards the bank. Inline SVG
// with CSS animation (no image file); still when the person prefers reduced
// motion.
import { GREEN, INK, MUTED, TINT } from './ui.tsx'

const USDC_BLUE = '#2775CA'
const WATER = '#BFDCFF'
const WATER_DEEP = '#A9CDF7'

const CSS = `
@keyframes help-in { 0% { transform: translate(-78px, -82px) scale(1); opacity: 0 } 12% { opacity: 1 } 78% { transform: translate(0, 0) scale(1); opacity: 1 } 100% { transform: translate(0, 8px) scale(.45); opacity: 0 } }
@keyframes help-splash { 0%, 74% { transform: scale(.2); opacity: 0 } 82% { opacity: .9 } 100% { transform: scale(1.8); opacity: 0 } }
@keyframes help-out { 0% { transform: translate(0, 6px) scale(.45); opacity: 0 } 18% { transform: translate(8px, -14px) scale(1); opacity: 1 } 88% { opacity: 1 } 100% { transform: translate(80px, -84px) scale(1); opacity: 0 } }
@keyframes help-wave { to { transform: translateX(-70px) } }
@keyframes help-rise { 0% { transform: translateY(0); opacity: 0 } 25% { opacity: 1 } 100% { transform: translateY(-44px); opacity: 0 } }
.help-anim .coin-in { animation: help-in 2.7s ease-in infinite; transform-box: fill-box; transform-origin: center }
.help-anim .splash-in { animation: help-splash 2.7s ease-out infinite; transform-box: fill-box; transform-origin: center }
.help-anim .coin-out { animation: help-out 2.7s ease-out infinite; transform-box: fill-box; transform-origin: center }
.help-anim .wave { animation: help-wave 3.2s linear infinite }
.help-anim .wave.back { animation-duration: 4.6s; animation-direction: reverse }
.help-anim .bubble { animation: help-rise 3s ease-out infinite; transform-box: fill-box; transform-origin: center }
@media (prefers-reduced-motion: reduce) { .help-anim * { animation: none !important } }
`

/** A USDC-style coin centred on (0, 0). */
function Coin({ className, delay }: { className: string; delay: number }) {
  return (
    <g className={className} style={{ animationDelay: `${delay}s` }}>
      <circle r="10" fill={USDC_BLUE} />
      <circle r="10" fill="none" stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="1" />
      <text y="4" textAnchor="middle" fontSize="12" fontWeight="700" fill="#FFFFFF" fontFamily="Inter, system-ui, sans-serif">$</text>
    </g>
  )
}

/** The wave outline, wide enough to scroll by 70px without a gap. */
const WAVE = 'M-70 0 q 17.5 -7 35 0 t 35 0 t 35 0 t 35 0 t 35 0 t 35 0 t 35 0 t 35 0 t 35 0 V 90 H -70 Z'

export default function PoolAnimation() {
  return (
    <div style={{ background: TINT, borderRadius: 16, padding: '10px 8px 4px' }}>
      <style>{CSS}</style>
      <svg className="help-anim" viewBox="0 0 340 190" width="100%" role="img" aria-label="Dollars flow into one shared pool, earn interest there, and flow out to the bank">
        <defs>
          <clipPath id="help-pool-clip">
            <rect x="100" y="78" width="140" height="92" rx="22" />
          </clipPath>
        </defs>

        {/* Labels at the two ends and under the pool */}
        <text x="52" y="18" textAnchor="middle" fontSize="11" fontWeight="600" fill={INK} fontFamily="Inter, system-ui, sans-serif">Money from Kate</text>
        <text x="52" y="31" textAnchor="middle" fontSize="10" fill={MUTED} fontFamily="Inter, system-ui, sans-serif">arrives as dollars</text>
        <text x="290" y="18" textAnchor="middle" fontSize="11" fontWeight="600" fill={INK} fontFamily="Inter, system-ui, sans-serif">To the bank</text>
        <text x="290" y="31" textAnchor="middle" fontSize="10" fill={MUTED} fontFamily="Inter, system-ui, sans-serif">paid out in pula</text>
        <text x="170" y="186" textAnchor="middle" fontSize="10.5" fontWeight="600" fill={GREEN} fontFamily="Inter, system-ui, sans-serif">One shared pool · earning interest on Blend</text>

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
          {/* Interest: small "+" bubbles rising through the water */}
          {[
            [138, 0],
            [162, 1.1],
            [186, 0.5],
            [212, 1.7],
          ].map(([x, delay]) => (
            <g key={x} className="bubble" style={{ animationDelay: `${delay}s` }} transform={`translate(${x} 160)`}>
              <circle r="6" fill="#FFFFFF" fillOpacity="0.9" />
              <text y="3.5" textAnchor="middle" fontSize="10" fontWeight="700" fill={GREEN} fontFamily="Inter, system-ui, sans-serif">+</text>
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
      </svg>
    </div>
  )
}
