import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Landing from './pages/Landing.jsx';
import Setup from './pages/Setup.jsx';
import Room from './pages/Room.jsx';
import History from './pages/History.jsx';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/interview/:id" element={<Room />} />
          <Route path="/history" element={<History />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </main>
    </div>
  );
}
