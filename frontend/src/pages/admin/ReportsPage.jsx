import { useState, useEffect } from 'react'
import { admin, chat } from '../../api'

export default function ReportsPage() {
  const [reportType, setReportType] = useState('district')
  const [districtsData, setDistrictsData] = useState(null)
  const [selectedDistrict, setSelectedDistrict] = useState('')
  const [selectedAssembly, setSelectedAssembly] = useState('')
  const [selectedBooth, setSelectedBooth] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [reportHeaders, setReportHeaders] = useState([])
  const [reportData, setReportData] = useState([])
  const [errorMsg, setErrorMsg] = useState('')
  // FIX-07: server-side pagination for member-detail drilldowns
  const [pageInfo, setPageInfo] = useState(null) // { total_records, current_page, total_pages, page_size }

  // Load districts & assemblies data on mount
  useEffect(() => {
    chat.getDistrictsData()
      .then(res => {
        if (res.success && res.data) {
          setDistrictsData(res.data)
        }
      })
      .catch(err => console.error('Error fetching districts:', err))
  }, [])

  // Clear sub-filters when report type changes
  useEffect(() => {
    setSelectedDistrict('')
    setSelectedAssembly('')
    setSelectedBooth('')
    setStartDate('')
    setEndDate('')
    setReportHeaders([])
    setReportData([])
    setErrorMsg('')
    setPageInfo(null)
  }, [reportType])

  const districts = districtsData ? Object.keys(districtsData).sort() : []
  const assemblies = (selectedDistrict && districtsData) ? districtsData[selectedDistrict].sort((a,b) => a.name.localeCompare(b.name)) : []

  // Dynamic Booth Options
  const selectedAssemblyObj = assemblies.find(a => a.name === selectedAssembly)
  const numBooths = selectedAssemblyObj ? selectedAssemblyObj.booths : 0
  const boothOptions = []
  if (numBooths > 0) {
    for (let i = 1; i <= numBooths; i++) {
      boothOptions.push(i)
    }
  }

  const handleGenerate = async (goPage = 1) => {
    setLoading(true)
    setErrorMsg('')
    try {
      const params = {
        type: reportType,
        district: selectedDistrict,
        assembly: selectedAssembly,
        booth: selectedBooth,
        startDate,
        endDate,
        page: goPage
      }
      const res = await admin.getReports(params)
      if (res.success) {
        setReportHeaders(res.headers || [])
        setReportData(res.data || [])
        // Detail (member) reports come back paginated; aggregate reports don't.
        if (typeof res.total_pages === 'number') {
          setPageInfo({
            total_records: res.total_records,
            current_page: res.current_page,
            total_pages: res.total_pages,
            page_size: res.page_size,
          })
        } else {
          setPageInfo(null)
        }
      } else {
        setErrorMsg(res.message || 'Failed to generate report.')
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to fetch report.')
    } finally {
      setLoading(false)
    }
  }

  const goToPage = (p) => {
    if (!pageInfo) return
    const target = Math.min(Math.max(1, p), pageInfo.total_pages)
    if (target === pageInfo.current_page) return
    handleGenerate(target)
  }

  const handleDownload = () => {
    const baseUrl = import.meta.env.VITE_API_URL || ''
    const params = new URLSearchParams({
      type: reportType,
      district: selectedDistrict,
      assembly: selectedAssembly,
      booth: selectedBooth,
      startDate,
      endDate,
      format: 'excel'
    })
    window.open(`${baseUrl}/admin/api/reports?${params.toString()}`, '_blank')
  }

  return (
    <div>
      <div className="page-header">
        <h1><i className="bi bi-file-earmark-bar-graph-fill me-2 text-coral" />Reports & Analytics</h1>
        <p>Analyze and download district-wise, assembly-wise, booth-wise, and referral performance reports</p>
      </div>

      <div className="admin-card" style={{ marginBottom: 24 }}>
        <div className="admin-card-header">
          <h6 className="admin-card-title"><i className="bi bi-sliders" /> Filter Options</h6>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, alignItems: 'end' }}>
            {/* Report Type Select */}
            <div>
              <label style={{ fontSize: 13, fontWeight: '600', color: 'var(--admin-ink)', display: 'block', marginBottom: 6 }}>Report Type</label>
              <select
                className="admin-search-input"
                style={{ width: '100%', height: 38, padding: '0 10px', fontSize: 13, background: 'var(--admin-surface-raise)', border: '1px solid var(--border-dim)', borderRadius: 6 }}
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
              >
                <option value="district">District-wise Reports</option>
                <option value="assembly">Assembly-wise Reports</option>
                <option value="booth">Booth-wise Reports</option>
                <option value="date">Date-wise Registration Reports</option>
                <option value="performers">Top Performer Reports (More Referrals)</option>
                <option value="referrals">Referrals-wise Reports</option>
              </select>
            </div>

            {/* District Filter */}
            <div>
              <label style={{ fontSize: 13, fontWeight: '600', color: 'var(--admin-ink)', display: 'block', marginBottom: 6 }}>Filter District</label>
              <select
                className="admin-search-input"
                style={{ width: '100%', height: 38, padding: '0 10px', fontSize: 13, background: 'var(--admin-surface-raise)', border: '1px solid var(--border-dim)', borderRadius: 6 }}
                value={selectedDistrict}
                onChange={(e) => {
                  setSelectedDistrict(e.target.value)
                  setSelectedAssembly('')
                  setSelectedBooth('')
                }}
              >
                <option value="">-- All Districts --</option>
                {districts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* Assembly Filter (Conditional) */}
            {reportType !== 'district' && (
              <div>
                <label style={{ fontSize: 13, fontWeight: '600', color: 'var(--admin-ink)', display: 'block', marginBottom: 6 }}>Filter Assembly</label>
                <select
                  className="admin-search-input"
                  style={{ width: '100%', height: 38, padding: '0 10px', fontSize: 13, background: 'var(--admin-surface-raise)', border: '1px solid var(--border-dim)', borderRadius: 6 }}
                  value={selectedAssembly}
                  onChange={(e) => {
                    setSelectedAssembly(e.target.value)
                    setSelectedBooth('')
                  }}
                  disabled={!selectedDistrict}
                >
                  <option value="">-- All Assemblies --</option>
                  {assemblies.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                </select>
              </div>
            )}

            {/* Booth Filter (Conditional) */}
            {reportType !== 'district' && reportType !== 'assembly' && (
              <div>
                <label style={{ fontSize: 13, fontWeight: '600', color: 'var(--admin-ink)', display: 'block', marginBottom: 6 }}>Filter Booth</label>
                <select
                  className="admin-search-input"
                  style={{ width: '100%', height: 38, padding: '0 10px', fontSize: 13, background: 'var(--admin-surface-raise)', border: '1px solid var(--border-dim)', borderRadius: 6 }}
                  value={selectedBooth}
                  onChange={(e) => setSelectedBooth(e.target.value)}
                  disabled={!selectedAssembly}
                >
                  <option value="">-- All Booths --</option>
                  {boothOptions.map(b => <option key={b} value={b}>Booth {b}</option>)}
                </select>
              </div>
            )}

            {/* Date Range Filters (Conditional) */}
            {reportType === 'date' && (
              <>
                <div>
                  <label style={{ fontSize: 13, fontWeight: '600', color: 'var(--admin-ink)', display: 'block', marginBottom: 6 }}>From Date</label>
                  <input
                    type="date"
                    className="admin-search-input"
                    style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 13, background: 'var(--admin-surface-raise)', border: '1px solid var(--border-dim)', borderRadius: 6, color: 'var(--admin-ink)' }}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: '600', color: 'var(--admin-ink)', display: 'block', marginBottom: 6 }}>To Date</label>
                  <input
                    type="date"
                    className="admin-search-input"
                    style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 13, background: 'var(--admin-surface-raise)', border: '1px solid var(--border-dim)', borderRadius: 6, color: 'var(--admin-ink)' }}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => handleGenerate(1)}
                disabled={loading}
                style={{
                  height: 38,
                  flex: 1,
                  background: 'var(--color-coral-pulse)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                {loading ? (
                  <div className="spinner-border spinner-border-sm text-white" style={{ width: 14, height: 14 }} />
                ) : (
                  <i className="bi bi-play-fill" />
                )}
                Generate
              </button>
              
              <button
                type="button"
                onClick={handleDownload}
                style={{
                  height: 38,
                  padding: '0 16px',
                  background: '#16a34a',
                  border: 'none',
                  color: '#fff',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <i className="bi bi-file-earmark-excel-fill" />
                Export Excel
              </button>
            </div>
          </div>
          {errorMsg && (
            <div style={{ marginTop: 12, fontSize: 13, color: '#dc2626' }}>
              <i className="bi bi-exclamation-triangle-fill me-1" /> {errorMsg}
            </div>
          )}
        </div>
      </div>

      {/* Preview Table */}
      {reportData.length > 0 && (
        <div className="admin-card">
          <div className="admin-card-header">
            <h6 className="admin-card-title">
              <i className="bi bi-table" /> Report Preview
              {pageInfo
                ? ` (${pageInfo.total_records.toLocaleString()} total — page ${pageInfo.current_page} of ${pageInfo.total_pages})`
                : ` (${reportData.length} records)`}
            </h6>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  {reportHeaders.map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {reportData.map((row, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--admin-ink-dim)' }}>
                      {pageInfo ? (pageInfo.current_page - 1) * pageInfo.page_size + i + 1 : i + 1}
                    </td>
                    {reportHeaders.map(h => (
                      <td key={h}>
                        {h.toLowerCase().includes('count') || h.toLowerCase().includes('total') ? (
                          <span className="badge-status badge-generated" style={{ fontWeight: '600' }}>
                            {row[h]}
                          </span>
                        ) : (
                          row[h]
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination controls (member-detail reports only) */}
          {pageInfo && pageInfo.total_pages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 20px', borderTop: '1px solid var(--border-dim)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--admin-ink-dim)' }}>
                Showing {(pageInfo.current_page - 1) * pageInfo.page_size + 1}
                {'–'}
                {Math.min(pageInfo.current_page * pageInfo.page_size, pageInfo.total_records)} of {pageInfo.total_records.toLocaleString()}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => goToPage(pageInfo.current_page - 1)}
                  disabled={loading || pageInfo.current_page <= 1}
                  style={{ height: 34, padding: '0 14px', background: 'var(--admin-surface-raise)', border: '1px solid var(--border-dim)', borderRadius: 6, fontSize: 13, color: 'var(--admin-ink)', cursor: pageInfo.current_page <= 1 ? 'not-allowed' : 'pointer', opacity: pageInfo.current_page <= 1 ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <i className="bi bi-chevron-left" /> Prev
                </button>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-ink)' }}>
                  {pageInfo.current_page} / {pageInfo.total_pages}
                </span>
                <button
                  type="button"
                  onClick={() => goToPage(pageInfo.current_page + 1)}
                  disabled={loading || pageInfo.current_page >= pageInfo.total_pages}
                  style={{ height: 34, padding: '0 14px', background: 'var(--admin-surface-raise)', border: '1px solid var(--border-dim)', borderRadius: 6, fontSize: 13, color: 'var(--admin-ink)', cursor: pageInfo.current_page >= pageInfo.total_pages ? 'not-allowed' : 'pointer', opacity: pageInfo.current_page >= pageInfo.total_pages ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  Next <i className="bi bi-chevron-right" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
