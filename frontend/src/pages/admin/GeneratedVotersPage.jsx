import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { admin } from '../../api'

function MemberAvatar({ url }) {
  const [error, setError] = useState(false)
  if (url && !error) {
    return (
      <img
        src={url}
        alt="DP"
        onError={() => setError(true)}
        style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-dim)' }}
      />
    )
  }
  return (
    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--admin-surface-raise)', border: '1px solid var(--border-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--admin-ink-dim)' }}>
      <i className="bi bi-person-fill" style={{ fontSize: 16 }} />
    </div>
  )
}

function Pagination({ page, total, perPage = 20, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  if (totalPages <= 1) return null
  const start = Math.max(1, page - 2)
  const end   = Math.min(totalPages, page + 2)
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i)
  return (
    <div className="admin-pagination">
      <span className="pagination-info">{total} records</span>
      <button className="page-btn" aria-label="First page" disabled={page <= 1} onClick={() => onChange(1)}><i className="bi bi-chevron-double-left" /></button>
      <button className="page-btn" aria-label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)}><i className="bi bi-chevron-left" /></button>
      {start > 1 && <span className="pagination-info">…</span>}
      {pages.map((p) => <button key={p} className={`page-btn${p === page ? ' active' : ''}`} onClick={() => onChange(p)}>{p}</button>)}
      {end < totalPages && <span className="pagination-info">…</span>}
      <button className="page-btn" aria-label="Next page" disabled={page >= totalPages} onClick={() => onChange(page + 1)}><i className="bi bi-chevron-right" /></button>
      <button className="page-btn" aria-label="Last page" disabled={page >= totalPages} onClick={() => onChange(totalPages)}><i className="bi bi-chevron-double-right" /></button>
    </div>
  )
}

export default function GeneratedVotersPage() {
  const navigate = useNavigate()
  const [data, setData]       = useState({ voters: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(1)
  const [search, setSearch]   = useState('')
  const [searchInput, setSearchInput] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await admin.getGeneratedVoters({ page, search, per_page: 20 })
      setData({ voters: res.voters || res.data || res.members || [], total: res.total || 0 })
    } catch {
      setData({ voters: [], total: 0 })
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = (e) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const voters = data.voters

  return (
    <div>
      <div className="page-header">
        <h1><i className="bi bi-card-list me-2 text-coral" />Generated Members</h1>
        <p>Voters who have successfully generated their BJP ID card</p>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h6 className="admin-card-title"><i className="bi bi-table" /> Generated Members List</h6>
          <form className="admin-card-tools" onSubmit={handleSearch}>
            <input
              className="admin-search-input"
              type="text"
              placeholder="Search name / EPIC / mobile…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <button type="submit" style={{ background: 'var(--color-coral-pulse)', border: 'none', color: '#fff', padding: '7px 14px', borderRadius: 'var(--radius-buttons)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <i className="bi bi-search" /> Search
            </button>
            {search && (
              <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setPage(1) }} style={{ background: 'var(--admin-surface-raise)', border: '1px solid var(--border-dim)', color: 'var(--text-secondary)', padding: '7px 12px', borderRadius: 'var(--radius-buttons)', fontSize: 13, cursor: 'pointer' }}>Clear</button>
            )}
          </form>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center' }}><div className="spinner-border spinner-border-sm text-danger" /></div>
        ) : voters.length === 0 ? (
          <div className="empty-state"><i className="bi bi-credit-card" /><p>No generated members found{search ? ` for "${search}"` : ''}.</p></div>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>EPIC No</th>
                    <th>Mobile</th>
                    <th>Assembly</th>
                    <th>BJP Code</th>
                    <th>Generated At</th>
                    <th>Referrals</th>
                  </tr>
                </thead>
                <tbody>
                  {voters.map((v, i) => {
                    const codeVal = v.bjp_code || v.ptc_code
                    return (
                      <tr 
                        key={codeVal || v.epic_no || i}
                        onClick={() => codeVal && navigate(`/admin/generated-voters/${codeVal}`)}
                        style={{ cursor: 'pointer' }}
                        className="clickable-row"
                      >
                        <td style={{ color: 'var(--admin-ink-dim)' }}>{(page - 1) * 20 + i + 1}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <MemberAvatar url={v.photo_url} />
                            <span style={{ fontWeight: 500 }}>{v.name || v.Name}</span>
                          </div>
                        </td>
                        <td><code style={{ color: 'var(--admin-ink)', background: 'var(--admin-surface-raise)', border: '1px solid var(--border-dim)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>{v.epic_no || v.EpicNo}</code></td>
                        <td style={{ color: 'var(--admin-ink-dim)', fontSize: 12 }}>{v.mobile || '—'}</td>
                        <td style={{ color: 'var(--admin-ink-dim)' }}>{v.assembly || v.AssemblyName}</td>
                        <td>
                          {codeVal
                            ? <span style={{ color: 'var(--admin-badge-green)', fontWeight: 600, fontSize: 12 }}>{codeVal}</span>
                            : <span style={{ color: 'var(--admin-ink-dim)' }}>—</span>
                          }
                        </td>
                        <td style={{ color: 'var(--admin-ink-dim)', fontSize: 11 }}>
                          {v.generated_at ? new Date(v.generated_at).toLocaleString() : '—'}
                        </td>
                        <td>
                          <span className="badge-status badge-generated" style={{ fontWeight: '600' }}>
                            {v.referred_members_count || 0}
                          </span>
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
