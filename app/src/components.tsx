import { Link } from 'react-router-dom'

/** Plain header for the /dev page, which has no design in docs/. */
export function TopBar({ title, back = '/' }: { title: string; back?: string }) {
  return (
    <header className="topbar">
      <Link to={back} className="back" aria-label="Back">
        ‹
      </Link>
      <h1>{title}</h1>
    </header>
  )
}
