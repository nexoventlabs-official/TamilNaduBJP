import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
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

export default function LocalBodyPage() {
  const navigate = useNavigate()
  const [data, setData]       = useState({ voters: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(1)
  const [search, setSearch]   = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [interestFilter, setInterestFilter] = useState('all')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await admin.getLocalBody({ page, search, interest: interestFilter, per_page: 20 })
      setData({ voters: res.data || [], total: res.total || 0 })
    } catch (err) {
      console.error(err)
      setData({ voters: [], total: 0 })
    } finally {
      setLoading(false)
    }
  }, [page, search, interestFilter])

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
        <h1><i className="bi bi-building me-2 text-coral" />Local Body Requests</h1>
        <p>Manage member interest responses for upcoming Local Body Elections</p>
      </div>

      <div className="admin-card">
        <div className="admin-card-header" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
          <h6 className="admin-card-title"><i className="bi bi-table" /> Responses List</h6>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Filter Dropdown */}
            <select
              className="admin-search-input"
              style={{ height: 38, fontSize: 13, background: 'var(--admin-surface-raise)', border: '1px solid var(--border-dim)', borderRadius: 6, padding: '0 10px' }}
              value={interestFilter}
              onChange={(e) => {
                setInterestFilter(e.target.value)
                setPage(1)
              }}
            >
              <option value="all">-- All Responses --</option>
              <option value="interested">Interested</option>
              <option value="not_interested">Not Interested</option>
              <option value="not_answered">Not Selected Any Thing</option>
            </select>

            {/* Search form */}
            <form className="admin-card-tools" onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
              <input
                className="admin-search-input"
                type="text"
                placeholder="Search name / EPIC / mobile…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                style={{ height: 38 }}
              />
              <button type="submit" style={{ height: 38, background: 'var(--color-coral-pulse)', border: 'none', color: '#fff', padding: '0 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <i className="bi bi-search" /> Search
              </button>
              {search && (
                <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setPage(1) }} style={{ height: 38, background: 'var(--admin-surface-raise)', border: '1px solid var(--border-dim)', color: 'var(--text-secondary)', padding: '0 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Clear</button>
              )}
            </form>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center' }}><div className="spinner-border spinner-border-sm text-danger" /></div>
        ) : voters.length === 0 ? (
          <div className="empty-state"><i className="bi bi-building" /><p>No local body responses found{search ? ` for "${search}"` : ''}.</p></div>
        ) : (
          <>
            <div className="admin-medialist">
              {voters.map((v, i) => {
                const codeVal = v.bjp_code
                const interest = v.local_body_interest
                const badge = interest === 'interested'
                  ? { cls: 'b-interested', label: 'Interested' }
                  : interest === 'not_interested'
                  ? { cls: 'b-not_interested', label: 'Not Interested' }
                  : { cls: 'b-neutral', label: 'Not Answered' }
                return (
                  <div
                    key={codeVal || v.epic_no || i}
                    className="ml-row ml-clickable"
                    onClick={() => codeVal && navigate(`/admin/generated-voters/${codeVal}`)}
                  >
                    <span className="ml-index">{(page - 1) * 20 + i + 1}</span>
                    <Cover url={v.photo_url} />
                    <div className="ml-info">
                      <span className="ml-name">{v.name || '—'}</span>
                      <span className="ml-sub">
                        <code>{v.epic_no || '—'}</code>
                        {codeVal && <span className="ml-code">{codeVal}</span>}
                        {v.assembly && <span>{v.assembly}</span>}
                        {v.mobile && <span className="ml-mob">{v.mobile}</span>}
                      </span>
                    </div>
                    <div className="ml-right">
                      <span className={`ml-badge ${badge.cls}`}>{badge.label}</span>
                      <span className="ml-date">{v.generated_at ? new Date(v.generated_at).toLocaleDateString() : ''}</span>
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
