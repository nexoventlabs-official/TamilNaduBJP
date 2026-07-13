import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { admin } from '../../api'

function StatCard({ icon, label, value, color, bg }) {
  return (
    <div className="stat-card" style={{ '--sc-color': color, '--sc-bg': bg }}>
      <div className="stat-card-icon">
        <i className={`bi bi-${icon}`} />
      </div>
      <div className="stat-card-value">{value ?? '—'}</div>
      <div className="stat-card-label">{label}</div>
    </div>
  )
}

function StatusRow({ label, status, detail }) {
  const cls = status === 'ok' ? 'ok' : status === 'warning' ? 'warning' : 'error'
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(29, 30, 28, 0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)' }}>
        <span className={`status-dot ${cls}`} />
        {label}
      </div>
      {detail !== undefined && (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{detail}</span>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [stats, setStats]       = useState(null)
  const [extStats, setExtStats] = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    Promise.allSettled([admin.getStats(), admin.getExternalStats()])
      .then(([s, e]) => {
        if (s.status === 'fulfilled') setStats(s.value)
        if (e.status === 'fulfilled') setExtStats(e.value)
      })
      .finally(() => setLoading(false))
  }, [])

  const s = stats || {}
  const e = extStats || {}

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <div className="spinner-border text-danger" role="status" />
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1><i className="bi bi-grid-1x2-fill me-2 text-coral" />Dashboard</h1>
        <p>Overview of BJP Tamil Nadu membership platform</p>
      </div>

      {/* Primary stats */}
      <div className="stat-cards-grid">
        <StatCard icon="people-fill"        label="Total Voters"       value={s.total_voters}       color="#E53935" bg="rgba(229,57,53,0.12)" />
        <StatCard icon="person-check-fill"  label="Total Members"      value={s.total_members}      color="#43a047" bg="rgba(46,125,50,0.12)" />
        <StatCard icon="share-fill"         label="Total Referrals"    value={s.total_referrals}    color="#e65100" bg="rgba(230,81,0,0.12)" />
      </div>

      {/* Volunteer & Booth stats */}
      <div className="stat-cards-grid">
        <StatCard icon="hand-thumbs-up"        label="Pending Organizers"    value={s.pending_volunteers}    color="#fbc02d" bg="rgba(251,192,45,0.1)" />
        <StatCard icon="check-circle-fill"     label="Confirmed Organizers"  value={s.confirmed_volunteers}  color="#43a047" bg="rgba(46,125,50,0.1)" />
        <StatCard icon="building"              label="Pending Booth Agents"  value={s.pending_booth_agents}  color="#fbc02d" bg="rgba(251,192,45,0.1)" />
        <StatCard icon="shield-fill-check"     label="Confirmed Booth Agents" value={s.confirmed_booth_agents} color="#1565c0" bg="rgba(21,101,192,0.1)" />
      </div>

      {/* Interest & Meeting stats */}
      <div className="stat-cards-grid">
        <StatCard icon="geo-alt-fill"          label="Local Body Interest"   value={s.local_body_interest_count} color="#00838f" bg="rgba(0,131,143,0.1)" />
        <StatCard icon="calendar2-check-fill"  label="Meet Requests"         value={s.meet_requests_count} color="#6a1b9a" bg="rgba(106,27,154,0.1)" />
      </div>

      {/* Leaderboard */}
      <div style={{ marginTop: 24 }}>
        {/* Top 5 Referrals Leaderboard */}
        <div className="admin-card" style={{ margin: 0 }}>
          <div className="admin-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h6 className="admin-card-title"><i className="bi bi-trophy-fill text-coral" /> Top 5 Referrers</h6>
            <span style={{ fontSize: 11, color: '#8696a0' }}>Referral Champions</span>
          </div>
          <div className="admin-table-wrap" style={{ border: 'none', margin: 0 }}>
            <table className="admin-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ padding: '8px 12px' }}>#</th>
                  <th style={{ padding: '8px 12px' }}>Photo</th>
                  <th style={{ padding: '8px 12px' }}>Name</th>
                  <th style={{ padding: '8px 12px' }}>Code</th>
                  <th style={{ padding: '8px 12px' }}>Assembly</th>
                  <th style={{ padding: '8px 12px' }}>Count</th>
                </tr>
              </thead>
              <tbody>
                {s.top_referrals && s.top_referrals.length > 0 ? (
                  s.top_referrals.map((r, idx) => (
                    <tr key={idx} onClick={() => navigate(`/admin/generated-voters/${r.code}`)} style={{ cursor: 'pointer' }} className="admin-clickable-row">
                      <td style={{ padding: '8px 12px', color: 'var(--admin-ink-dim)', verticalAlign: 'middle' }}>{idx + 1}</td>
                      <td style={{ padding: '8px 12px', verticalAlign: 'middle' }}>
                        {r.photo_url ? (
                          <img src={r.photo_url} alt="Profile" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(0,0,0,0.08)' }} />
                        ) : (
                          <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="bi bi-person-fill" style={{ color: '#8696a0', fontSize: 16 }} />
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: '500', verticalAlign: 'middle' }}>{r.name}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', verticalAlign: 'middle' }}>{r.code}</td>
                      <td style={{ padding: '8px 12px', verticalAlign: 'middle' }}>{r.assembly || r.district}</td>
                      <td style={{ padding: '8px 12px', verticalAlign: 'middle' }}>
                        <span className="badge-status badge-generated" style={{ fontWeight: '600', padding: '2px 6px', fontSize: 11 }}>
                          {r.referrals}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 20, color: 'var(--admin-ink-dim)' }}>
                      No referrals data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Raw stats (if API returns extra data) */}
      {Object.keys(s).length === 0 && Object.keys(e).length === 0 && (
        <div className="empty-state">
          <i className="bi bi-bar-chart-line" />
          <p>No statistics available. The backend may be returning a different format.</p>
        </div>
      )}
    </div>
  )
}
