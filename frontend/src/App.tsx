import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import AuthGate from './components/AuthGate'
import Login from './pages/Login'
import GMDashboard from './pages/GMDashboard'
import GameMaster from './pages/GameMaster'
import GrandmasterDashboard from './pages/GrandmasterDashboard'
import Rooms from './pages/Rooms'
import Bookings from './pages/Bookings'
import Settings from './pages/Settings'
import StaffManagement from './pages/StaffManagement'
import Clients from './pages/Clients'
import Book from './pages/Book'
import BookConfirm from './pages/BookConfirm'
import Waiver from './pages/Waiver'
import PublicAvailability from './pages/PublicAvailability'

function App() {
  return (
    <Routes>
      {/* Root redirects to login */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/availability" element={<PublicAvailability />} />
      <Route path="/book" element={<Book />} />
      <Route path="/book/confirm/:reference" element={<BookConfirm />} />
      <Route path="/waiver/:id" element={<Waiver />} />

      {/* Staff routes (both roles) */}
      <Route element={<AuthGate allowedRoles={['grandmaster', 'gamemaster']} />}>
        <Route element={<Layout />}>
          <Route path="/gm" element={<GMDashboard />} />
          <Route path="/calendar" element={<GameMaster />} />
          <Route path="/rooms" element={<Rooms />} />
          <Route path="/bookings" element={<Bookings />} />
        </Route>
      </Route>

      {/* Grandmaster-only routes */}
      <Route element={<AuthGate allowedRoles={['grandmaster']} />}>
        <Route element={<Layout />}>
          <Route path="/grandmaster" element={<GrandmasterDashboard />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/staff" element={<StaffManagement />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
