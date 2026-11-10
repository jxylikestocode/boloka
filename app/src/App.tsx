import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { SavingsProvider, useSavings } from './savings.tsx'
import Home from './screens/Home.tsx'
import Received from './screens/Received.tsx'
import Send from './screens/Send.tsx'
import Drip from './screens/Drip.tsx'
import Private from './screens/Private.tsx'
import ShowLender from './screens/ShowLender.tsx'
import Lender from './screens/Lender.tsx'
import Dev from './screens/Dev.tsx'
import SenderSend from './screens/SenderSend.tsx'
import Admin from './screens/Admin.tsx'
import Arrival from './Arrival.tsx'
import { FEATURES } from './features.ts'
import Launcher from './screens/Launcher.tsx'
import OnChainOverlay from './OnChainOverlay.tsx'
import HowItWorks from './screens/HowItWorks.tsx'
import BankApp from './screens/BankApp.tsx'

/** The 390px-wide phone screens, which all need the user's account. */
function Phone() {
  return (
    <SavingsProvider>
      <div className="phone">
        <Arrival />
        <Gate />
        <OnChainOverlay />
      </div>
    </SavingsProvider>
  )
}

function Gate() {
  const s = useSavings()
  if (s.status === 'loading') {
    return <div className="center muted">Setting up your account…</div>
  }
  if (s.status === 'error') {
    return (
      <div className="center">
        <p>Something went wrong.</p>
        <button className="btn secondary" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    )
  }
  return <Outlet />
}

/**
 * Which app this server runs. Each app has its own port (its own origin, so
 * its own storage and home-screen identity, like separate apps on a phone):
 *   boloka → 5174, moneygram → 5175, bank → 5176.
 * Unset (plain `npm run dev`) serves all three on one port, by path.
 */
const APP = import.meta.env.VITE_APP as 'boloka' | 'moneygram' | 'bank' | undefined

export default function App() {
  if (APP === 'moneygram') {
    return (
      <Routes>
        <Route path="*" element={<><SenderSend /><OnChainOverlay /></>} />
      </Routes>
    )
  }
  if (APP === 'bank') {
    return (
      <Routes>
        <Route path="*" element={<BankApp />} />
      </Routes>
    )
  }
  const allInOne = APP === undefined
  return (
    <Routes>
      {/* The lender works on their own computer, with no account here. */}
      <Route path="/lender" element={<Lender />} />
      {/* Pool admin: lend to and recall from Blend, signed with Freighter. */}
      <Route path="/admin" element={<Admin />} />
      {/* The sender's mock MoneyGram screen, on the sender's own phone. */}
      {allInOne && <Route path="/moneygram" element={<><SenderSend /><OnChainOverlay /></>} />}
      {/* The receiver's bank app (fictional bank), where bank withdrawals land. */}
      {allInOne && <Route path="/bank" element={<BankApp />} />}
      {allInOne && <Route path="/send" element={<Navigate to="/moneygram" replace />} />}
      {/* Receiver screens that need no balance open without waiting. */}
      {FEATURES.drip && <Route path="/drip" element={<Drip />} />}
      {FEATURES.privacy && <Route path="/private" element={<Private />} />}
      {/* For judges, not linked from the parents' screens. */}
      <Route path="/how-it-works" element={<HowItWorks mode="testnet" />} />
      {/* One URL for everything: the root explains the demo; Boloka's home is /home. */}
      {allInOne && <Route index element={<Launcher mode="testnet" />} />}
      <Route element={<Phone />}>
        {allInOne ? <Route path="/home" element={<Home />} /> : <Route index element={<Home />} />}
        <Route path="/received" element={<Received />} />
        <Route path="/orange" element={<Send />} />
        <Route path="/prove" element={<ShowLender />} />
        <Route path="/dev" element={<Dev />} />
      </Route>
    </Routes>
  )
}
