import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { chat } from '../api'
import { FlipCard3D } from '../components/FlipCard3D'

export default function MyMembersPage() {
  const { wtlCode } = useParams()
  const navigate = useNavigate()
  const [root, setRoot] = useState(null)
  const [tree, setTree] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedMember, setSelectedMember] = useState(null)

  useEffect(() => {
    if (!wtlCode) return
    chat.getMyMembers(wtlCode)
      .then((data) => {
        setRoot(data.root || null)
        setTree(data.tree || [])
      })
      .catch((err) => {
        setError(err.message || 'Unable to load referred members.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [wtlCode])

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
        <i className="bi bi-people-fill" style={{ fontSize: 48, color: 'var(--color-signal-mint)' }} />
        <h2 style={{ fontSize: 20, fontWeight: 500 }}>Unable to Load Members</h2>
        <p style={{ color: 'var(--color-ash)', fontSize: 14 }}>{error}</p>
        <button onClick={() => navigate('/')} style={{ background: 'var(--color-signal-mint)', color: 'var(--color-abyss)', border: 'none', padding: '12px 24px', borderRadius: '16px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
          Go Back
        </button>
      </div>
    )
  }

  const directCount = tree.length
  const indirectCount = tree.reduce((acc, curr) => acc + (curr.referrals?.length || 0), 0)
  const totalCount = directCount + indirectCount

  const renderNode = (member, level) => {
    const isRoot = level === 1
    const nodeWidth = isRoot ? '210px' : '180px'
    
    return (
      <div key={member.wtl_code} className={`tree-node level-${level}`} style={{
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
        zIndex: 2,
        flexShrink: 0
      }}>
        {/* Node card inner */}
        <div 
          onClick={() => setSelectedMember(member)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            background: 'var(--color-carbon)',
            border: isRoot ? '2px solid #FF9933' : '1px solid var(--color-graphite)',
            borderRadius: '12px',
            cursor: 'pointer',
            width: nodeWidth,
            boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
            transition: 'all 0.15s ease',
            zIndex: 3
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = isRoot ? '#FF9933' : 'var(--color-signal-mint)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = isRoot ? '#FF9933' : 'var(--color-graphite)';
            e.currentTarget.style.transform = 'none';
          }}
        >
          {/* Photo */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {member.photo_url ? (
              <img src={member.photo_url} alt={member.name} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--color-graphite)' }} />
            ) : (
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#252d27', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-graphite)' }}>
                <i className="bi bi-person-fill" style={{ color: 'var(--color-ash)', fontSize: 14 }} />
              </div>
            )}
            <span style={{
              position: 'absolute',
              bottom: -3,
              right: -3,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: level === 1 ? '#FF9933' : level === 2 ? 'var(--color-signal-mint)' : '#17a2b8',
              color: '#000',
              fontSize: 8,
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>L{level}</span>
          </div>

          {/* Details */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, textAlign: 'left' }}>
            <span style={{ fontSize: 11, fontWeight: 'bold', color: 'var(--color-chalk)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.name}</span>
            <span style={{ fontSize: 9, color: 'var(--color-signal-mint)', fontFamily: 'monospace', fontWeight: 600 }}>{member.wtl_code}</span>
          </div>

          <i className="bi bi-chevron-right" style={{ color: 'var(--color-ash)', fontSize: 10, flexShrink: 0 }} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-abyss)', padding: '40px 16px', letterSpacing: '0.05em' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <img src="/bjp_logo.svg" alt="BJP" style={{ width: 44, height: 44, objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-chalk)', letterSpacing: '0.1em' }}>BJP TAMIL NADU</div>
            <div style={{ fontSize: 11, color: 'var(--color-signal-mint)', fontWeight: 600 }}>
              Referral Tree Network — {directCount} Direct | {indirectCount} Indirect ({totalCount} Total)
            </div>
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

        {/* Tree Container (Left-to-Right layout) */}
        <div style={{ 
          background: 'var(--color-carbon)', 
          border: '1px solid var(--color-graphite)', 
          borderRadius: 20, 
          padding: '40px 32px', 
          display: 'flex', 
          alignItems: 'center',
          minHeight: '400px',
          overflowX: 'auto',
          overflowY: 'auto',
          gap: '48px',
          position: 'relative'
        }}>
          
          {/* LAYER 1: ROOT */}
          <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
            {root && renderNode(root, 1)}
            {/* Horizontal connection line to L2 column */}
            {tree.length > 0 && (
              <div style={{
                width: '48px',
                height: '2px',
                background: 'var(--color-graphite)',
                flexShrink: 0
              }} />
            )}
          </div>

          {/* LAYERS 2 & 3 */}
          {tree.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-ash)', maxWidth: 400 }}>
              <i className="bi bi-diagram-3" style={{ fontSize: 48, color: 'var(--color-graphite)', marginBottom: 16, display: 'block' }} />
              <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-chalk)', marginBottom: 8 }}>Tree structure empty</h3>
              <p style={{ fontSize: 13, margin: '0 auto' }}>
                You haven't referred anyone yet. Share your custom BJP code to build your 3-layer support network!
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
              
              {/* Vertical connecting line spanning from first to last L2 node */}
              {tree.length > 1 && (
                <div style={{
                  position: 'absolute',
                  left: '-24px',
                  top: '25px', // Center of first L2 row
                  bottom: '25px', // Center of last L2 row
                  width: '2px',
                  background: 'var(--color-graphite)',
                  zIndex: 1
                }} />
              )}

              {/* Stack of Rows */}
              {tree.map(parent => {
                const hasChildren = parent.referrals && parent.referrals.length > 0
                return (
                  <div key={parent.wtl_code} style={{
                    display: 'flex',
                    alignItems: 'center',
                    position: 'relative',
                    gap: '24px'
                  }}>
                    {/* Horizontal link from L2 vertical line to L2 Node */}
                    <div style={{
                      position: 'absolute',
                      left: '-24px',
                      top: '50%',
                      width: '24px',
                      height: '2px',
                      background: 'var(--color-graphite)',
                      transform: 'translateY(-50%)',
                      zIndex: 1
                    }} />

                    {/* L2 Parent Node */}
                    {renderNode(parent, 2)}

                    {/* Link from L2 Parent Node to L3 row */}
                    {hasChildren && (
                      <div style={{
                        width: '24px',
                        height: '2px',
                        background: 'var(--color-graphite)',
                        flexShrink: 0
                      }} />
                    )}

                    {/* L3 Children row */}
                    {hasChildren && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        position: 'relative'
                      }}>
                        {/* Horizontal connecting line for the L3 row */}
                        {parent.referrals.length > 1 && (
                          <div style={{
                            position: 'absolute',
                            left: '0px',
                            right: `${180 / 2}px`, // Stops at center of last node
                            height: '2px',
                            background: 'var(--color-graphite)',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            zIndex: 1
                          }} />
                        )}

                        {parent.referrals.map(child => (
                          <div key={child.wtl_code} style={{ display: 'flex', alignItems: 'center', gap: '16px', position: 'relative' }}>
                            {/* Vertical link line up to node */}
                            <div style={{
                              position: 'absolute',
                              left: '0px',
                              width: '2px',
                              height: '10px',
                              background: 'var(--color-graphite)',
                              bottom: '50%',
                              zIndex: 1,
                              display: 'none' // kept simple
                            }} />
                            {renderNode(child, 3)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* MEMBER DETAILS MODAL */}
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
                  wtl_code: selectedMember.wtl_code,
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
                <span style={{ color: 'var(--color-signal-mint)', fontFamily: 'monospace', fontWeight: 700 }}>{selectedMember.wtl_code}</span>
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
              {selectedMember.generated_at && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--color-ash)' }}>Joined Date</span>
                  <span style={{ color: 'var(--color-chalk)', fontWeight: 600 }}>{new Date(selectedMember.generated_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
