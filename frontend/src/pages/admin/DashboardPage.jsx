import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { admin } from '../../api'
import '../../styles/admin-medialist.css'

// Gold crown for #1, silver/bronze medals for #2/#3, plain number otherwise
function RankBadge({ rank }) {
  if (rank === 1) {
    return (
      <span className="ml-rank" title="Top referrer">
        <svg className="ml-crown" width="22" height="22" viewBox="0 0 24 24" fill="#FFC107" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 7l4.5 3.5L12 4l4.5 6.5L21 7l-1.8 10.5H4.8L3 7z" />
          <rect x="4.8" y="18.2" width="14.4" height="2.4" rx="0.8" />
          <circle cx="3" cy="6.2" r="1.4" />
          <circle cx="21" cy="6.2" r="1.4" />
          <circle cx="12" cy="3.2" r="1.4" />
        </svg>
      </span>
    )
  }
  const medalCls = rank === 2 ? 'silver' : rank === 3 ? 'bronze' : 'plain'
  return (
    <span className="ml-rank"><span className={`ml-medal ${medalCls}`}>{rank}</span></span>
  )
}

function LbCover({ url }) {
  const [error, setError] = useState(false)
  if (url && !error) return <img className="ml-cover" src={url} alt="" onError={() => setError(true)} />
  return <div className="ml-cover"><i className="bi bi-person-fill" /></div>
}

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
          {s.top_referrals && s.top_referrals.length > 0 ? (
            <div className="admin-medialist">
              {s.top_referrals.map((r, idx) => (
                <div
                  key={idx}
                  className={`ml-row ml-clickable${idx === 0 ? ' ml-first' : ''}`}
                  onClick={() => navigate(`/admin/generated-voters/${r.code}`)}
                >
                  <RankBadge rank={idx + 1} />
                  <LbCover url={r.photo_url} />
                  <div className="ml-info">
                    <span className="ml-name">{r.name || '—'}</span>
                    <span className="ml-sub">
                      {r.code && <span className="ml-code">{r.code}</span>}
                      {(r.assembly || r.district) && <span>{r.assembly || r.district}</span>}
                    </span>
                  </div>
                  <div className="ml-right">
                    <span className="ml-count" title="Referrals"><i className="bi bi-people-fill" /> {r.referrals}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--admin-ink-dim)', fontSize: 13 }}>
              No referrals data yet.
            </div>
          )}
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
