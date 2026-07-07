import { useNavigate } from 'react-router-dom'

export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--color-abyss)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 20, padding: 24, textAlign: 'center',
    }}>
      <img src="/bjplogo.webp" alt="BJP" style={{ width: 72, opacity: 0.85 }} onError={(e) => { e.target.style.display = 'none' }} />
      <div style={{ fontSize: 64, fontWeight: 800, color: 'var(--color-chalk)', lineHeight: 1 }}>404</div>
      <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-chalk)' }}>Page Not Found</div>
      <div style={{ fontSize: 14, color: 'var(--color-ash)', maxWidth: 300 }}>
        The page you're looking for doesn't exist or has been moved.
      </div>
      <button
        onClick={() => navigate('/')}
        style={{
          marginTop: 8,
          background: '#FF9933', color: '#fff', border: 'none',
          padding: '12px 28px', minHeight: 44, borderRadius: 16,
          fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <i className="bi bi-house-fill" /> Go Home
      </button>
    </div>
  )
}
