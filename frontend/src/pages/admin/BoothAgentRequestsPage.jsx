import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { admin } from '../../api'

function Pagination({ page, total, perPage = 20, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  if (totalPages <= 1) return null
  const start = Math.max(1, page - 2)
  const end   = Math.min(totalPages, page + 2)
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i)
  return (
    <div className="admin-pagination">
      <span className="pagination-info">{total} records</span>
      <button className="page-btn" aria-label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)}><i className="bi bi-chevron-left" /></button>
      {pages.map((p) => <button key={p} className={`page-btn${p === page ? ' active' : ''}`} onClick={() => onChange(p)}>{p}</button>)}
      <button className="page-btn" aria-label="Next page" disabled={page >= totalPages} onClick={() => onChange(page + 1)}><i className="bi bi-chevron-right" /></button>
    </div>
  )
}

export default function BoothAgentRequestsPage() {
  const [data, setData]       = useState({ requests: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(1)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [actionLoading, setActionLoading] = useState({})
  const [search, setSearch]   = useState('')
  const [searchInput, setSearchInput] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await admin.getBoothAgentRequests({ page, status: statusFilter, search, per_page: 20 })
      setData({ requests: res.requests || res.data || [], total: res.total || 0 })
    } catch {
      setData({ requests: [], total: 0 })
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, search])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = (e) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const handleAction = async (wtlCode, action) => {
    if (!window.confirm(`Are you sure you want to ${action} this booth agent request?`)) return
    setActionLoading((prev) => ({ ...prev, [wtlCode]: action }))
    try {
      if (action === 'confirm') await admin.confirmBoothAgent(wtlCode)
      else                      await admin.rejectBoothAgent(wtlCode)
      loadData()
    } catch (err) {
      alert(err.message || `Failed to ${action} request`)
    } finally {
      setActionLoading((prev) => { const n = { ...prev }; delete n[wtlCode]; return n })
    }
  }

  const requests = data.requests

  return (
    <div>
      <div className="page-header">
        <h1><i className="bi bi-building-fill me-2 text-coral" />Booth Agent Requests</h1>
        <p>Review and manage booth agent applications</p>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h6 className="admin-card-title"><i className="bi bi-building" /> Requests</h6>
          <div className="admin-card-tools" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="admin-search-input"
                type="text"
                placeholder="Search name / EPIC / BJP Code…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <button type="submit" style={{ background: 'var(--color-coral-pulse)', border: 'none', color: '#fff', padding: '7px 14px', borderRadius: 'var(--radius-buttons)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <i className="bi bi-search" /> Search
              </button>
              {search && (
                <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setPage(1) }} style={{ background: '#f1f5f9', border: '1px solid rgba(0,0,0,0.1)', color: '#475569', padding: '7px 14px', borderRadius: 'var(--radius-buttons)', fontSize: 13, cursor: 'pointer' }}>
                  Clear
                </button>
              )}
            </form>
            <select
              className="admin-select"
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            >
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="rejected">Rejected</option>
              <option value="">All</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center' }}><div className="spinner-border spinner-border-sm text-danger" /></div>
        ) : requests.length === 0 ? (
          <div className="empty-state"><i className="bi bi-building" /><p>No {statusFilter} booth agent requests found.</p></div>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>EPIC No</th>
                    <th>BJP Code</th>
                    <th>Booth No</th>
                    <th>Mobile</th>
                    <th>Requested At</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r, i) => {
                    const status    = r.status || 'pending'
                    const codeVal   = r.wtl_code || r.ptc_code
                    const key       = codeVal || r.epic_no || i
                    const isLoading = actionLoading[codeVal]
                    return (
                      <tr key={key}>
                        <td style={{ color: '#8696a0' }}>{(page - 1) * 20 + i + 1}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {r.photo_url ? (
                              <img src={r.photo_url} alt="Photo" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,102,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className="bi bi-person" style={{ color: 'var(--color-coral)' }} />
                              </div>
                            )}
                            <Link to={`/admin/generated-voters/${codeVal}`} style={{ color: '#1e293b', textDecoration: 'none', fontWeight: 600 }}>
                              {r.name || r.Name || '—'}
                            </Link>
                          </div>
                        </td>
                        <td>
                          <Link to={`/admin/generated-voters/${codeVal}`} style={{ color: '#64b5f6', fontSize: 12 }}>{r.epic_no}</Link>
                        </td>
                        <td>
                          {codeVal
                            ? <Link to={`/admin/generated-voters/${codeVal}`} style={{ color: '#43a047', fontSize: 12 }}>{codeVal}</Link>
                            : '—'
                          }
                        </td>
                        <td>
                          {r.booth_no
                            ? <span style={{ background: 'rgba(21,101,192,0.12)', color: '#64b5f6', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{r.booth_no}</span>
                            : '—'
                          }
                        </td>
                        <td style={{ color: '#8696a0', fontSize: 12 }}>{r.mobile || '—'}</td>
                        <td style={{ color: '#8696a0', fontSize: 11 }}>
                          {r.requested_at ? new Date(r.requested_at).toLocaleDateString() : '—'}
                        </td>
                        <td><span className={`badge-status badge-${status}`}>{status}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 5 }}>
                            {status === 'pending' && (
                              <>
                                <button
                                  className="btn-action btn-confirm"
                                  onClick={() => handleAction(codeVal, 'confirm')}
                                  disabled={!!isLoading}
                                >
                                  {isLoading === 'confirm' ? <span className="spinner-border spinner-border-sm" /> : <><i className="bi bi-check-lg" /> Confirm</>}
                                </button>
                                <button
                                  className="btn-action btn-reject"
                                  onClick={() => handleAction(codeVal, 'reject')}
                                  disabled={!!isLoading}
                                >
                                  {isLoading === 'reject' ? <span className="spinner-border spinner-border-sm" /> : <><i className="bi bi-x-lg" /> Reject</>}
                                </button>
                              </>
                            )}
                            {status !== 'pending' && (
                              <span style={{ fontSize: 11, color: '#8696a0', fontStyle: 'italic' }}>Reviewed</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={data.total} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  )
}
