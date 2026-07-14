import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { chat } from '../api'
import { FlipCard3D } from '../components/FlipCard3D'

export default function BestPerformersPage() {
  const navigate = useNavigate()
  const [performers, setPerformers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedMember, setSelectedMember] = useState(null)

  useEffect(() => {
    chat.getBestPerformers()
      .then((data) => {
        setPerformers(data.performers || [])
      })
      .catch((err) => {
        setError(err.message || 'Unable to load leaderboard.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-abyss)' }}>
        <div style={{ width: 40, height: 40, border: '3px solid rgba(12, 59, 28, 0.15)', borderTopColor: 'var(--color-signal-mint)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, background: 'var(--color-abyss)', color: 'var(--color-chalk)', padding: 24, textAlign: 'center', letterSpacing: '0.05em' }}>
        <i className="bi bi-exclamation-triangle" style={{ fontSize: 48, color: '#FF9933' }} />
        <h2 style={{ fontSize: 20, fontWeight: 500 }}>Unable to Load Leaderboard</h2>
        <p style={{ color: 'var(--color-ash)', fontSize: 14 }}>{error}</p>
        <button onClick={() => navigate('/')} style={{ background: 'var(--color-signal-mint)', color: 'var(--color-abyss)', border: 'none', padding: '12px 24px', borderRadius: '16px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
          Go Back
        </button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-abyss)', padding: '40px 16px', letterSpacing: '0.05em' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <img src="/bjp_logo.svg" alt="BJP" style={{ width: 44, height: 44, objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-chalk)', letterSpacing: '0.1em' }}>BJP TAMIL NADU</div>
            <div style={{ fontSize: 11, color: 'var(--color-signal-mint)', fontWeight: 600 }}>Top 5 Referral Performers</div>
          </div>
          <button
            onClick={() => navigate('/')}
            style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--color-graphite)', color: 'var(--color-chalk)', padding: '8px 16px', borderRadius: '16px', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s' }}
            onMouseEnter={(e) => { e.target.style.borderColor = 'var(--color-ash)' }}
            onMouseLeave={(e) => { e.target.style.borderColor = 'var(--color-graphite)' }}
          >
            <i className="bi bi-arrow-left" /> Back to Console
          </button>
        </div>

        {/* Lead Container */}
        <div style={{ 
          background: 'var(--color-carbon)', 
          border: '1px solid var(--color-graphite)', 
          borderRadius: 24, 
          padding: '40px 24px',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Decorative Top Glow */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '80%',
            height: '2px',
            background: 'linear-gradient(90deg, transparent 0%, #FF9933 50%, transparent 100%)'
          }} />

          {/* Trophy Header Icon */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
            <div style={{ 
              width: 72, 
              height: 72, 
              borderRadius: '50%', 
              background: 'rgba(255, 153, 51, 0.1)', 
              border: '2px solid #FF9933', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              marginBottom: 16,
              boxShadow: '0 0 20px rgba(255, 153, 51, 0.2)'
            }}>
              <i className="bi bi-trophy-fill" style={{ fontSize: 32, color: '#FF9933' }} />
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-chalk)', marginBottom: 8 }}>Referral Champions</h2>
            <p style={{ fontSize: 13, color: 'var(--color-ash)', textAlign: 'center', maxWidth: 440 }}>
              Leading volunteers who are driving local outreach and expanding our digital footprint across Tamil Nadu.
            </p>
          </div>

          {/* Performers Stack */}
          {performers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-ash)' }}>
              <i className="bi bi-people-fill" style={{ fontSize: 40, color: 'var(--color-graphite)', marginBottom: 12, display: 'block' }} />
              <p>No referrals recorded yet. Be the first performer!</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {performers.map((p, index) => {
                const rank = index + 1
                const isTop3 = rank <= 3
                
                // Color badges
                const rankStyles = {
                  1: { border: '2px solid #FF9933', bg: 'var(--color-carbon)', badge: '#FF9933', emoji: '👑' },
                  2: { border: '1px solid #c0c0c0', bg: 'var(--color-carbon)', badge: '#c0c0c0', emoji: '🥈' },
                  3: { border: '1px solid #cd7f32', bg: 'var(--color-carbon)', badge: '#cd7f32', emoji: '🥉' },
                  4: { border: '1px solid var(--color-graphite)', bg: 'var(--color-carbon)', badge: 'var(--color-ash)', emoji: '' },
                  5: { border: '1px solid var(--color-graphite)', bg: 'var(--color-carbon)', badge: 'var(--color-ash)', emoji: '' }
                }

                const style = rankStyles[rank] || rankStyles[5]

                return (
                  <div 
                    key={p.bjp_code}
                    onClick={() => setSelectedMember(p)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      padding: '16px 20px',
                      background: style.bg,
                      border: style.border,
                      borderRadius: '20px',
                      cursor: 'pointer',
                      boxShadow: isTop3 ? '0 4px 20px rgba(0,0,0,0.15)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.015)';
                      e.currentTarget.style.borderColor = 'var(--color-signal-mint)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.borderColor = style.border.split(' ')[2];
                    }}
                  >
                    {/* Rank Badge */}
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: `1.5px solid ${style.badge}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 15,
                      fontWeight: 'bold',
                      color: style.badge,
                      flexShrink: 0
                    }}>
                      {rank}
                    </div>

                    {/* Profile Photo */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      {p.photo_url ? (
                        <img src={p.photo_url} alt={p.name} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid var(--color-graphite)' }} />
                      ) : (
                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#252d27', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--color-graphite)' }}>
                          <i className="bi bi-person-fill" style={{ color: 'var(--color-ash)', fontSize: 22 }} />
                        </div>
                      )}
                      {style.emoji && (
                        <span style={{ position: 'absolute', top: -8, right: -8, fontSize: 16 }}>{style.emoji}</span>
                      )}
                    </div>

                    {/* Identity Details */}
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <span style={{ fontSize: 15, fontWeight: 'bold', color: 'var(--color-chalk)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-ash)', fontFamily: 'monospace' }}>BJP Code: <span style={{ color: 'var(--color-signal-mint)', fontWeight: 600 }}>{p.bjp_code}</span></span>
                    </div>

                    {/* Referrals Score */}
                    <div style={{
                      background: 'rgba(19, 136, 8, 0.1)',
                      border: '1.5px solid rgba(19, 136, 8, 0.3)',
                      color: 'var(--color-signal-mint)',
                      padding: '8px 16px',
                      borderRadius: '16px',
                      fontSize: 13,
                      fontWeight: 'bold',
                      fontFamily: 'monospace',
                      flexShrink: 0
                    }}>
                      {p.referrals} {p.referrals === 1 ? 'REFERRAL' : 'REFERRALS'}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* PERFORMER DETAILS MODAL */}
      {selectedMember && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: 16
        }} onClick={() => setSelectedMember(null)}>
          <div style={{
            background: 'var(--color-carbon)',
            border: '1.5px solid var(--color-graphite)',
            borderRadius: 24,
            width: '100%',
            maxWidth: '460px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            position: 'relative'
          }} onClick={(e) => e.stopPropagation()}>
            {/* Close Button */}
            <button 
              onClick={() => setSelectedMember(null)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'transparent',
                border: 'none',
                color: 'var(--color-ash)',
                fontSize: 22,
                cursor: 'pointer'
              }}
            >
              <i className="bi bi-x-lg" />
            </button>

            {/* Modal Header */}
            <h3 style={{ fontSize: 16, fontWeight: 'bold', color: 'var(--color-chalk)', marginBottom: 20 }}>Member Registration Card</h3>

            {/* Card Preview */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <FlipCard3D
                cardData={{
                  name: selectedMember.name,
                  epic_no: selectedMember.epic_no,
                  assembly_name: selectedMember.assembly_name,
                  district: selectedMember.district,
                  part_no: selectedMember.part_no,
                  bjp_code: selectedMember.bjp_code,
                  photo_url: selectedMember.photo_url
                }}
                width={360}
                autoFlip={false}
                showActions={false}
              />
            </div>

            {/* Information Grid */}
            <div style={{
              background: '#131915',
              border: '1px solid var(--color-graphite)',
              borderRadius: 16,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--color-ash)' }}>Member Name</span>
                <span style={{ color: 'var(--color-chalk)', fontWeight: 600 }}>{selectedMember.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--color-ash)' }}>EPIC Number</span>
                <span style={{ color: 'var(--color-chalk)', fontFamily: 'monospace', fontWeight: 600 }}>{selectedMember.epic_no || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--color-ash)' }}>BJP Code</span>
                <span style={{ color: 'var(--color-signal-mint)', fontFamily: 'monospace', fontWeight: 700 }}>{selectedMember.bjp_code}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--color-ash)' }}>Assembly (Booth)</span>
                <span style={{ color: 'var(--color-chalk)', fontWeight: 600 }}>
                  {selectedMember.assembly_name ? `${selectedMember.assembly_name} (Part ${selectedMember.part_no || '—'})` : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--color-ash)' }}>District</span>
                <span style={{ color: 'var(--color-chalk)', fontWeight: 600 }}>{selectedMember.district || '—'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
