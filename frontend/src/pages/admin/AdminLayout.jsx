import { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { admin } from '../../api'
import '../../styles/admin.css'

const NAV_ITEMS = [
  { path: '/admin/dashboard',          icon: 'grid-1x2-fill',       label: 'Dashboard' },
  { path: '/admin/voters',             icon: 'people-fill',          label: 'Voters' },
  { path: '/admin/generated-voters',   icon: 'card-list',            label: 'Generated Members' },
  { path: '/admin/volunteer-requests', icon: 'hand-thumbs-up-fill',  label: 'Organizer Requests' },
  { path: '/admin/confirmed-volunteers', icon: 'check-circle-fill',  label: 'Confirmed Organizers' },
  { path: '/admin/booth-agent-requests', icon: 'building-fill',      label: 'Booth Agent Requests' },
  { path: '/admin/confirmed-booth-agents', icon: 'shield-fill-check', label: 'Confirmed Booth Agents' },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const [checking, setChecking]       = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 768)

  useEffect(() => {
    admin.getSession()
      .then((data) => {
        // Verify the response is a real authenticated session, not a stale
        // HTML page or unexpected response (e.g. when VITE_API_URL is not set)
        if (data && data.success === true) {
          setChecking(false)
        } else {
          navigate('/admin/login', { replace: true })
        }
      })
      .catch(() => navigate('/admin/login', { replace: true }))
  }, [navigate])

  const handleLogout = async () => {
    try { await admin.logout() } catch {}
    navigate('/admin/login', { replace: true })
  }

  if (checking) {
    return (
      <div className="page-loader">
        <div className="spinner-border text-danger" role="status" />
      </div>
    )
  }

  return (
    <div className="admin-layout">
      {/* Mobile backdrop — closes sidebar when tapped */}
      <div
        className={`admin-sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
        <div className="admin-sidebar-header">
          <img src="/bjp_logo.svg" alt="BJP" className="admin-logo"
            onError={(e) => { e.target.src = '/bjp_logo.png' }} />
          {sidebarOpen && (
            <div>
              <div className="admin-brand">BJP Tamil Nadu</div>
              <div className="admin-tagline">Admin Panel</div>
            </div>
          )}
        </div>

        <nav className="admin-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}
              title={!sidebarOpen ? item.label : undefined}
            >
              <i className={`bi bi-${item.icon}`} />
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <button className="admin-logout-btn" onClick={handleLogout} title={!sidebarOpen ? 'Logout' : undefined}>
            <i className="bi bi-box-arrow-left" />
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="admin-main">
        <header className="admin-topbar">
          <button className="admin-toggle-btn" onClick={() => setSidebarOpen((o) => !o)} aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
            <i className={`bi bi-${sidebarOpen ? 'layout-sidebar-reverse' : 'layout-sidebar'}`} />
          </button>
          <div className="admin-topbar-brand">BJP Tamil Nadu — Admin</div>
          <div className="admin-topbar-right" />
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
