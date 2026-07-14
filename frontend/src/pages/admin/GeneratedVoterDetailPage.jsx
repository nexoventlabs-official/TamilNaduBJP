import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { admin } from '../../api'
import { CardPreviewIframe } from '../../components/CardPreviewIframe'
import '../../styles/admin.css'

export default function GeneratedVoterDetailPage() {
  const { bjpCode } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [referred, setReferred] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState({ volunteer: null, booth_agent: null })
  const cardPreviewRef = useRef(null)

  useEffect(() => {
    setLoading(true)
    admin.getGeneratedVoterDetail(bjpCode)
      .then((res) => {
        if (res && res.success === true) {
          setData({
            ...res.voter,
            volunteer_req: res.volunteer_req,
            booth_agent_req: res.booth_agent_req,
            meet_req: res.meet_req
          })
          setReferred(res.referred || [])
        } else {
          setError(res.message || 'Voter detail not found.')
        }
      })
      .catch((err) => setError(err.message || 'Error loading detail.'))
      .finally(() => setLoading(false))
  }, [bjpCode])

  const handleAction = async (type, action) => {
    setActionLoading((prev) => ({ ...prev, [type]: action }))
    try {
      let res
      if (type === 'volunteer') {
        res = action === 'confirm'
          ? await admin.confirmVolunteer(bjpCode)
          : await admin.rejectVolunteer(bjpCode)
      } else {
        res = action === 'confirm'
          ? await admin.confirmBoothAgent(bjpCode)
          : await admin.rejectBoothAgent(bjpCode)
      }

      if (res && res.success === true) {
        // Refresh details on success
        const updated = await admin.getGeneratedVoterDetail(bjpCode)
        if (updated && updated.success === true) {
          setData({
            ...updated.voter,
            volunteer_req: updated.volunteer_req,
            booth_agent_req: updated.booth_agent_req,
            meet_req: updated.meet_req
          })
          setReferred(updated.referred || [])
        }
      } else {
        alert(res.message || 'Failed to update request status.')
      }
    } catch (err) {
      alert(err.message || 'An error occurred during verification.')
    } finally {
      setActionLoading((prev) => ({ ...prev, [type]: null }))
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner-border text-danger" /></div>
  if (error) return <div style={{ padding: 24, color: 'var(--color-harvest-flame)' }}><i className="bi bi-exclamation-circle me-2" />{error}</div>

  const v = data || {}
  const volReq  = data?.volunteer_req
  const baReq   = data?.booth_agent_req

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Page header and back button */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: '1px solid var(--border-dim)', color: 'var(--text-secondary)', padding: '8px 14px', borderRadius: 'var(--radius-buttons)', cursor: 'pointer', fontSize: 13 }}>
          <i className="bi bi-arrow-left me-1.5" /> Back
        </button>
        <div>
          <h1 style={{ fontSize: 20, margin: 0, fontWeight: 700 }}>Profile Dashboard</h1>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>Overview of voter information, card, referrals, and roles</p>
        </div>
      </div>

      {/* Profile Hero Header Card */}
      <div className="admin-card" style={{
        background: 'linear-gradient(135deg, #fafafa 0%, #ffffff 100%)',
        border: '1px solid rgba(242, 101, 34, 0.15)',
        borderRadius: 'var(--radius-cards)',
        padding: '24px',
        marginBottom: 24,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 24,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-card)'
      }}>
        {/* Saffron Glow effect */}
        <div style={{
          position: 'absolute',
          top: '-50%',
          right: '-10%',
          width: 300,
          height: 300,
          background: 'radial-gradient(circle, rgba(242,101,34,0.06) 0%, rgba(242,101,34,0) 70%)',
          pointerEvents: 'none'
        }} />
        
        {/* Photo Avatar */}
        {v.photo_url ? (
          <img src={v.photo_url} crossOrigin="anonymous" alt="Profile" style={{
            width: 100,
            height: 120,
            borderRadius: 12,
            objectFit: 'cover',
            border: '2px solid rgba(242, 101, 34, 0.35)',
            boxShadow: '0 4px 12px rgba(242, 101, 34, 0.08)'
          }} />
        ) : (
          <div style={{
            width: 100,
            height: 120,
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(242,101,34,0.04) 0%, rgba(242,101,34,0.12) 100%)',
            border: '2px solid rgba(242, 101, 34, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(242, 101, 34, 0.08)'
          }}>
            <i className="bi bi-person-fill" style={{ fontSize: 44, color: '#f26522' }} />
          </div>
        )}

        {/* Profile Info */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: '800', letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>
              {v.name || v.VOTER_NAME || '—'}
            </h1>
            <span style={{
              background: 'rgba(242, 101, 34, 0.08)',
              color: '#f26522',
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: '700',
              border: '1px solid rgba(242, 101, 34, 0.2)'
            }}>
              {bjpCode}
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', margin: '0 0 16px 0', fontSize: 14 }}>
            EPIC Number: <strong style={{ color: 'var(--text-primary)' }}>{v.epic_no || '—'}</strong>
          </p>

          {/* Quick status badges */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className={`badge-status badge-${volReq ? volReq.status : 'rejected'}`} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12 }}>
              <i className="bi bi-hand-thumbs-up-fill me-1.5" /> Organizer: {volReq ? volReq.status.toUpperCase() : 'NO'}
            </span>
            <span className={`badge-status badge-${baReq ? baReq.status : 'rejected'}`} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12 }}>
              <i className="bi bi-building-fill-check me-1.5" /> Booth Agent: {baReq ? baReq.status.toUpperCase() : 'NO'}
            </span>
          </div>
        </div>

        {/* Action verify button */}
        <div style={{ zIndex: 2 }}>
          {v.epic_no && (
            <a href={`/verify/${v.bjp_code || v.epic_no}`} target="_blank" rel="noreferrer" className="btn-action btn-view" style={{
              padding: '10px 20px',
              borderRadius: 'var(--radius-buttons)',
              fontWeight: '600',
              fontSize: 13,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              textDecoration: 'none',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <i className="bi bi-patch-check-fill" style={{ fontSize: 15 }} /> Verify Registration
            </a>
          )}
        </div>
      </div>

      {/* Grid Content Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24 }}>
        
        {/* Left Column (Profiles & Requests) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* Voter Registration Profile Card */}
          <div className="admin-card" style={{ margin: 0 }}>
            <div className="admin-card-header" style={{ borderBottom: '1px solid var(--border-dim)', padding: '16px 20px' }}>
              <h6 className="admin-card-title"><i className="bi bi-person-badge-fill" style={{ color: '#f26522' }} /> Voter Profile Data</h6>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
                {[
                  { label: 'Full Name', value: v.name || v.VOTER_NAME || '—', icon: 'bi-person' },
                  { label: 'EPIC Number', value: v.epic_no || '—', icon: 'bi-card-text' },
                  { label: 'Mobile Number', value: v.mobile || '—', icon: 'bi-telephone' },
                  { label: 'BJP Code', value: v.bjp_code || bjpCode, icon: 'bi-qr-code' },
                  { label: 'Registered Assembly', value: v.assembly_name ? `${v.assembly_name} (${v.assembly})` : (v.assembly || '—'), icon: 'bi-geo-alt' },
                  { label: 'Registered Booth (Part No)', value: v.part_no || '—', icon: 'bi-building' },
                  { label: 'District', value: v.district || '—', icon: 'bi-map' },
                  { label: 'Generated At', value: v.generated_at ? new Date(v.generated_at).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }) : '—', icon: 'bi-calendar-event' },
                  { label: 'Booth Agent Status', value: baReq ? baReq.status.toUpperCase() : 'NO REQUEST', icon: 'bi-building-fill-check' },
                  { label: 'Local Body Interest', value: data?.local_body_interest === 'interested' ? 'Interested' : data?.local_body_interest === 'not_interested' ? 'Not Interested' : 'Not Answered', icon: 'bi-building' },
                  { label: 'President Meeting Status', value: referred.length < 5 ? 'Not Eligible (Requires 5 referrals)' : data?.meet_req?.interest === 'interested' ? 'Interested' : data?.meet_req?.interest === 'not_interested' ? 'Not Interested' : 'Not Answered', icon: 'bi-trophy-fill' },
                ].map((f) => {
                  let valColor = 'var(--text-primary)';
                  let valWeight = '500';
                  if (f.label === 'Booth Agent Status') {
                    if (f.value === 'CONFIRMED') valColor = '#2e7d32';
                    else if (f.value === 'REJECTED') valColor = '#c62828';
                    else if (f.value === 'PENDING') valColor = '#ef6c00';
                    valWeight = '700';
                  } else if (f.label === 'Local Body Interest' || f.label === 'President Meeting Status') {
                    if (f.value === 'Interested') valColor = '#2e7d32';
                    else if (f.value === 'Not Interested') valColor = '#c62828';
                    else if (f.value === 'Not Answered') valColor = '#ef6c00';
                    else valColor = 'var(--text-secondary)';
                    valWeight = '700';
                  }
                  return (
                    <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <i className={`bi ${f.icon} me-1.5`} /> {f.label}
                      </span>
                      <span style={{ fontSize: 14, color: valColor, fontWeight: valWeight }}>
                        {f.value}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Organizer Application Card */}
          {volReq ? (
            <div className="admin-card" style={{ margin: 0, border: '1px solid rgba(0,160,64,0.2)' }}>
              <div className="admin-card-header" style={{
                background: 'linear-gradient(90deg, rgba(0,160,64,0.04) 0%, rgba(0,0,0,0) 100%)',
                borderBottom: '1px solid var(--border-dim)',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <h6 className="admin-card-title" style={{ color: '#00a040' }}>
                  <i className="bi bi-hand-thumbs-up-fill me-2" /> Organizer Application
                </h6>
                <span className={`badge-status badge-${volReq.status}`}>{volReq.status}</span>
              </div>
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px', marginBottom: 20 }}>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Selected Wing</span>
                    <div style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: '600', marginTop: 4 }}>{volReq.wing || '—'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Requested At</span>
                    <div style={{ fontSize: 14, color: 'var(--text-primary)', marginTop: 4 }}>
                      {volReq.requested_at ? new Date(volReq.requested_at).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }) : '—'}
                    </div>
                  </div>
                </div>
                
                {/* Application actions inside detail page */}
                {volReq.status !== 'confirmed' && (
                  <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--border-dim)', paddingTop: 16 }}>
                    <button
                      className="btn-action btn-confirm"
                      style={{ flex: 1, padding: '10px', fontSize: 13, borderRadius: 'var(--radius-buttons)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      onClick={() => handleAction('volunteer', 'confirm')}
                      disabled={actionLoading.volunteer}
                    >
                      {actionLoading.volunteer === 'confirm' ? (
                        <span className="spinner-border spinner-border-sm" />
                      ) : (
                        <><i className="bi bi-check-circle" /> Approve Request</>
                      )}
                    </button>
                    {volReq.status === 'pending' && (
                      <button
                        className="btn-action btn-reject"
                        style={{ flex: 1, padding: '10px', fontSize: 13, borderRadius: 'var(--radius-buttons)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        onClick={() => handleAction('volunteer', 'reject')}
                        disabled={actionLoading.volunteer}
                      >
                        {actionLoading.volunteer === 'reject' ? (
                          <span className="spinner-border spinner-border-sm" />
                        ) : (
                          <><i className="bi bi-x-circle" /> Reject Request</>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="admin-card" style={{ margin: 0, opacity: 0.9 }}>
              <div className="admin-card-header" style={{ borderBottom: '1px solid var(--border-dim)', padding: '16px 20px' }}>
                <h6 className="admin-card-title" style={{ color: 'var(--text-secondary)' }}>
                  <i className="bi bi-hand-thumbs-up me-2" /> Organizer Application
                </h6>
              </div>
              <div style={{ padding: '20px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <i className="bi bi-info-circle" style={{ fontSize: 18, color: 'var(--text-secondary)' }} />
                  <span>This member has <strong>not requested</strong> to become an Organizer.</span>
                </div>
              </div>
            </div>
          )}

          {/* Booth Agent Application Card */}
          {baReq ? (
            <div className="admin-card" style={{ margin: 0, border: '1px solid rgba(242,101,34,0.2)' }}>
              <div className="admin-card-header" style={{
                background: 'linear-gradient(90deg, rgba(242,101,34,0.04) 0%, rgba(0,0,0,0) 100%)',
                borderBottom: '1px solid var(--border-dim)',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <h6 className="admin-card-title" style={{ color: '#f26522' }}>
                  <i className="bi bi-building-fill-check me-2" /> Booth Agent Application
                </h6>
                <span className={`badge-status badge-${baReq.status}`}>{baReq.status}</span>
              </div>
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px', marginBottom: 20 }}>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Requested District</span>
                    <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: '600', marginTop: 4 }}>{baReq.district || '—'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Requested Assembly</span>
                    <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: '600', marginTop: 4 }}>{baReq.assembly || '—'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Requested Booth (Part)</span>
                    <div style={{ fontSize: 14, color: 'var(--color-harvest-flame)', fontWeight: '700', marginTop: 4 }}>Booth {baReq.booth_no || '—'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Requested At</span>
                    <div style={{ fontSize: 14, color: 'var(--text-primary)', marginTop: 4 }}>
                      {baReq.requested_at ? new Date(baReq.requested_at).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }) : '—'}
                    </div>
                  </div>
                </div>

                {/* Application actions inside detail page */}
                {baReq.status !== 'confirmed' && (
                  <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--border-dim)', paddingTop: 16 }}>
                    <button
                      className="btn-action btn-confirm"
                      style={{ flex: 1, padding: '10px', fontSize: 13, borderRadius: 'var(--radius-buttons)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      onClick={() => handleAction('booth_agent', 'confirm')}
                      disabled={actionLoading.booth_agent}
                    >
                      {actionLoading.booth_agent === 'confirm' ? (
                        <span className="spinner-border spinner-border-sm" />
                      ) : (
                        <><i className="bi bi-check-circle" /> Approve Request</>
                      )}
                    </button>
                    {baReq.status === 'pending' && (
                      <button
                        className="btn-action btn-reject"
                        style={{ flex: 1, padding: '10px', fontSize: 13, borderRadius: 'var(--radius-buttons)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        onClick={() => handleAction('booth_agent', 'reject')}
                        disabled={actionLoading.booth_agent}
                      >
                        {actionLoading.booth_agent === 'reject' ? (
                          <span className="spinner-border spinner-border-sm" />
                        ) : (
                          <><i className="bi bi-x-circle" /> Reject Request</>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="admin-card" style={{ margin: 0, opacity: 0.9 }}>
              <div className="admin-card-header" style={{ borderBottom: '1px solid var(--border-dim)', padding: '16px 20px' }}>
                <h6 className="admin-card-title" style={{ color: 'var(--text-secondary)' }}>
                  <i className="bi bi-building me-2" /> Booth Agent Application
                </h6>
              </div>
              <div style={{ padding: '20px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <i className="bi bi-info-circle" style={{ fontSize: 18, color: 'var(--text-secondary)' }} />
                  <span>This member has <strong>not requested</strong> to become a Booth Agent.</span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Right Column (Visual Card Preview & Network Referrals) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* Card preview */}
          {(v.card_url || v.bjp_code || v.ptc_code) && (
            <div className="admin-card" style={{ margin: 0 }}>
              <div className="admin-card-header" style={{ borderBottom: '1px solid var(--border-dim)', padding: '16px 20px' }}>
                <h6 className="admin-card-title"><i className="bi bi-card-image" style={{ color: '#f26522' }} /> Member Identity Card</h6>
              </div>
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <CardPreviewIframe ref={cardPreviewRef} cardData={v} width={300} />
              </div>
            </div>
          )}

          {/* Referred Members */}
          <div className="admin-card" style={{ margin: 0 }}>
            <div className="admin-card-header" style={{ borderBottom: '1px solid var(--border-dim)', padding: '16px 20px' }}>
              <h6 className="admin-card-title">
                <i className="bi bi-people-fill" style={{ color: '#f26522' }} /> Referred Members ({referred.length})
              </h6>
            </div>
            <div style={{ padding: 0 }}>
              {referred.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <i className="bi bi-people" style={{ fontSize: 32, display: 'block', marginBottom: 8, opacity: 0.4 }} />
                  <span>No referred members registered under this profile.</span>
                </div>
              ) : (
                <div className="admin-table-wrap" style={{ margin: 0, borderRadius: '0 0 12px 12px' }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>EPIC No</th>
                        <th>Generated At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {referred.map((ref, idx) => (
                        <tr key={idx}>
                          <td style={{ color: 'var(--text-secondary)' }}>{idx + 1}</td>
                          <td style={{ fontWeight: 600 }}>{ref.name || ref.Name || '—'}</td>
                          <td>
                            {ref.epic_no ? (
                              <Link to={`/admin/generated-voters/${ref.bjp_code}`} style={{ color: 'var(--admin-badge-blue)', fontSize: 12, textDecoration: 'none' }}>
                                {ref.epic_no}
                              </Link>
                            ) : '—'}
                          </td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                            {ref.generated_at ? new Date(ref.generated_at).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' }) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}
