import { Link } from 'react-router-dom';
import { FiActivity } from 'react-icons/fi';

export default function Navbar() {
  return (
    <header className="border-b border-ink-700 bg-ink-950/80 backdrop-blur sticky top-0 z-10">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-extrabold tracking-tight text-white">
          <span className="grid place-items-center h-7 w-7 rounded-md bg-gradient-to-br from-accent-blue to-accent-violet">
            <FiActivity aria-hidden />
          </span>
          ThinkTrace
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-2 sm:gap-4"><Link to="/history" className="text-sm text-slate-400 hover:text-white">History</Link><Link to="/setup" className="btn-primary !py-1.5">New interview</Link></nav>
      </div>
    </header>
  );
}
