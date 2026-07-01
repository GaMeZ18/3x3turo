import { NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import CategoriesManager from '../components/admin/CategoriesManager.jsx'
import TeamsManager from '../components/admin/TeamsManager.jsx'
import GroupsManager from '../components/admin/GroupsManager.jsx'
import ScheduleManager from '../components/admin/ScheduleManager.jsx'
import MatchesManager from '../components/admin/MatchesManager.jsx'
import BracketManager from '../components/admin/BracketManager.jsx'
import SettingsManager from '../components/admin/SettingsManager.jsx'

const LINKS = [
  { to: '', label: 'Categorías', end: true },
  { to: 'equipos', label: 'Equipos' },
  { to: 'grupos', label: 'Grupos y calendario' },
  { to: 'horario', label: 'Pistas y horario' },
  { to: 'resultados', label: 'Resultados' },
  { to: 'eliminatoria', label: 'Eliminatoria' },
  { to: 'ajustes', label: 'Ajustes' },
]

export default function AdminDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/')
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand-mark">
          3X3<span>LIVE</span>
        </div>
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}
          >
            {l.label}
          </NavLink>
        ))}
        <div style={{ flex: 1 }} />
        <div className="side-link" onClick={() => navigate('/')}>
          Ver vista pública ↗
        </div>
        <div className="side-link" onClick={handleLogout}>
          Cerrar sesión
        </div>
      </aside>

      <main className="admin-main">
        <div className="admin-topbar">
          <p className="page-title">Panel de administración</p>
          <span className="chip">{user?.email}</span>
        </div>

        <Routes>
          <Route index element={<CategoriesManager />} />
          <Route path="equipos" element={<TeamsManager />} />
          <Route path="grupos" element={<GroupsManager />} />
          <Route path="horario" element={<ScheduleManager />} />
          <Route path="resultados" element={<MatchesManager />} />
          <Route path="eliminatoria" element={<BracketManager />} />
          <Route path="ajustes" element={<SettingsManager />} />
        </Routes>
      </main>
    </div>
  )
}
