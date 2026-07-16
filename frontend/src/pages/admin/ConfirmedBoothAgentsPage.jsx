import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { admin } from '../../api'
import '../../styles/admin-medialist.css'

function Cover({ url }) {
  const [error, setError] = useState(false)
  if (url && !error) return <img className="ml-cover" src={url} alt="" onError={() => setError(true)} />
  return <div className="ml-cover"><i className="bi bi-person-fill" /></div>
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
      <button className="page-btn" aria-label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)}><i className="bi bi-chevron-left" /></button>
      {pages.map((p) => <button key={p} className={`page-btn${p === page ? ' active' : ''}`} onClick={() => onChange(p)}>{p}</button>)}
      <button className="page-btn" aria-label="Next page" disabled={page >= totalPages} onClick={() => onChange(page + 1)}><i className="bi bi-chevron-right" /></button>
    </div>
  )
}

export default function ConfirmedBoothAgentsPage() {
  const navigate = useNavigate()
  const [data, setData]       = useState({ agents: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(1)
  const [search, setSearch]   = useState('')
  const [searchInput, setSearchInput] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await admin.getConfirmedBoothAgents({ page, search, per_page: 20 })
      setData({ agents: res.agents || res.booth_agents || res.data || [], total: res.total || 0 })
    } catch {
      setData({ agents: [], total: 0 })
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

  const agents = data.agents

  return (
    <div>
      <div className="page-header">
        <h1><i className="bi bi-shield-fill-check me-2 text-coral" />Confirmed Booth Agents</h1>
        <p>All approved booth agents by assembly booth</p>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h6 className="admin-card-title">
            <i className="bi bi-shield-check" /> Booth Agents
            <span className="badge-status badge-confirmed ms-2" style={{ fontSize: 11 }}>{data.total}</span>
          </h6>
          <form className="admin-card-tools" onSubmit={handleSearch}>
            <input
              className="admin-search-input"
              type="text"
              placeholder="Search name / EPIC / booth…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <button type="submit" style={{ background: 'var(--color-coral-pulse)', border: 'none', color: '#fff', padding: '7px 14px', borderRadius: 'var(--radius-buttons)', fontSize: 13, cursor: 'pointer' }}>
              <i className="bi bi-search" />
            </button>
            {search && (
              <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setPage(1) }} style={{ background: 'var(--admin-surface-raise)', border: '1px solid var(--border-dim)', color: 'var(--text-secondary)', padding: '7px 12px', borderRadius: 'var(--radius-buttons)', fontSize: 13, cursor: 'pointer' }}>Clear</button>
            )}
          </form>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center' }}><div className="spinner-border spinner-border-sm text-danger" /></div>
        ) : agents.length === 0 ? (
          <div className="empty-state"><i className="bi bi-shield-check" /><p>No confirmed booth agents found{search ? ` for "${search}"` : ''}.</p></div>
        ) : (
          <>
            <div className="admin-medialist">
              {agents.map((a, i) => {
                const codeVal = a.bjp_code || a.ptc_code
                return (
                  <div
                    key={codeVal || a.epic_no || i}
                    className="ml-row ml-clickable"
                    onClick={() => codeVal && navigate(`/admin/generated-voters/${codeVal}`)}
                  >
                    <span className="ml-index">{(page - 1) * 20 + i + 1}</span>
                    <Cover url={a.photo_url} />
                    <div className="ml-info">
                      <span className="ml-name">{a.name || a.Name || '—'}</span>
                      <span className="ml-sub">
                        <code>{a.epic_no}</code>
                        {codeVal && <span className="ml-code">{codeVal}</span>}
                        {(a.assembly || a.AssemblyName) && <span>{a.assembly || a.AssemblyName}</span>}
                        {a.mobile && <span className="ml-mob">{a.mobile}</span>}
                      </span>
                    </div>
                    <div className="ml-right">
                      {a.booth_no && <span className="ml-tag"><i className="bi bi-building" /> Booth {a.booth_no}</span>}
                      <span className="ml-date">{a.confirmed_at ? new Date(a.confirmed_at).toLocaleDateString() : ''}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <Pagination page={page} total={data.total} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  )
}
