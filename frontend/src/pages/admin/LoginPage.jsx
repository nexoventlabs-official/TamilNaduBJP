import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { admin } from '../../api'
import '../../styles/admin.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const [step, setStep]         = useState('mobile')  // 'mobile' | 'otp'
  const [mobile, setMobile]     = useState('')
  const [otp, setOtp]           = useState('')
  const [error, setError]       = useState('')
  const [info, setInfo]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  const startResendTimer = (sec = 60) => {
    if (timerRef.current) clearInterval(timerRef.current)
    setResendIn(sec)
    timerRef.current = setInterval(() => {
      setResendIn((s) => {
        if (s <= 1) { clearInterval(timerRef.current); timerRef.current = null; return 0 }
        return s - 1
      })
    }, 1000)
  }

  const handleSendOtp = async (e) => {
    e?.preventDefault()
    const m = mobile.replace(/\D/g, '')
    if (!/^[6-9]\d{9}$/.test(m)) {
      setError('Enter a valid 10-digit mobile number.')
      return
    }
    setError(''); setInfo(''); setLoading(true)
    try {
      const data = await admin.sendOtp(m)
      if (data && data.success) {
        setStep('otp')
        setInfo('OTP sent to your mobile number.')
        startResendTimer(60)
      } else {
        setError(data?.message || 'Could not send OTP.')
      }
    } catch (err) {
      setError(err?.message || 'This mobile number is not authorized for admin access.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendIn > 0 || loading) return
    await handleSendOtp()
  }

  const handleVerify = async (e) => {
    e?.preventDefault()
    const code = otp.replace(/\D/g, '')
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit OTP.')
      return
    }
    setError(''); setLoading(true)
    try {
      const data = await admin.verifyOtp(mobile.replace(/\D/g, ''), code)
      if (data && data.success === true) {
        navigate('/admin/dashboard', { replace: true })
      } else {
        setError(data?.message || 'Incorrect OTP.')
      }
    } catch (err) {
      setError(err?.message || 'Incorrect OTP. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-login-wrap">
      <div className="admin-login-card">
        <div className="admin-login-logo">
          <img src="/bjp_logo.svg" alt="BJP" onError={(e) => { e.target.src = '/bjp_logo.png' }} />
        </div>
        <div className="admin-login-title">BJP Tamil Nadu</div>
        <div className="admin-login-subtitle">Admin Panel — Secure OTP Login</div>

        {step === 'mobile' ? (
          <form onSubmit={handleSendOtp}>
            <div className="admin-form-group">
              <label htmlFor="admin-mobile" className="admin-form-label">Mobile Number</label>
              <input
                id="admin-mobile"
                className="admin-form-control"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="Enter authorized mobile number"
                autoComplete="tel"
                autoFocus
                disabled={loading}
              />
            </div>

            {error && (
              <div role="alert" style={{ background: 'rgba(242,101,34,0.06)', border: '1px solid rgba(242,101,34,0.2)', borderRadius: 'var(--radius-buttons)', padding: '9px 12px', fontSize: 13, color: 'var(--color-harvest-flame)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
                <i className="bi bi-exclamation-circle" /> {error}
              </div>
            )}

            <button className="admin-login-btn" type="submit" disabled={loading}>
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2" /> Sending OTP…</>
                : <><i className="bi bi-phone me-2" />Send OTP</>
              }
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify}>
            <div className="admin-form-group">
              <label htmlFor="admin-otp" className="admin-form-label">
                Enter OTP sent to {mobile.slice(0, 2)}XXXXX{mobile.slice(-3)}
              </label>
              <input
                id="admin-otp"
                className="admin-form-control"
                type="tel"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit OTP"
                autoComplete="one-time-code"
                autoFocus
                disabled={loading}
                style={{ letterSpacing: '0.3em', fontWeight: 600 }}
              />
            </div>

            {info && !error && (
              <div style={{ fontSize: 12.5, color: 'var(--color-signal-mint, #2ecc71)', marginBottom: 10 }}>
                <i className="bi bi-check-circle" /> {info}
              </div>
            )}
            {error && (
              <div role="alert" style={{ background: 'rgba(242,101,34,0.06)', border: '1px solid rgba(242,101,34,0.2)', borderRadius: 'var(--radius-buttons)', padding: '9px 12px', fontSize: 13, color: 'var(--color-harvest-flame)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
                <i className="bi bi-exclamation-circle" /> {error}
              </div>
            )}

            <button className="admin-login-btn" type="submit" disabled={loading}>
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2" /> Verifying…</>
                : <><i className="bi bi-shield-lock me-2" />Verify & Sign In</>
              }
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, fontSize: 13 }}>
              <button
                type="button"
                onClick={() => { setStep('mobile'); setOtp(''); setError(''); setInfo('') }}
                style={{ background: 'none', border: 'none', color: 'var(--admin-ink-dim)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                disabled={loading}
              >
                <i className="bi bi-arrow-left" /> Change number
              </button>
              {resendIn > 0 ? (
                <span style={{ color: 'var(--admin-ink-dim)' }}>Resend in {resendIn}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading}
                  style={{ background: 'none', border: 'none', color: 'var(--color-harvest-flame, #f26522)', fontWeight: 600, cursor: 'pointer' }}
                >
                  <i className="bi bi-arrow-clockwise" /> Resend OTP
                </button>
              )}
            </div>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-secondary)' }}>
          <i className="bi bi-lock" /> Authorized admins only
        </p>
      </div>
    </div>
  )
}
