import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

export default function ReferralPage() {
  const { bjpCode, referralId } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    if (bjpCode && referralId) {
      const cleanBjp = bjpCode.trim().toUpperCase()
      const cleanRid = referralId.trim().toUpperCase()
      try {
        localStorage.setItem('bjp_referral', JSON.stringify({
          bjpCode: cleanBjp,
          referralId: cleanRid,
          timestamp: Date.now(),
        }))
      } catch {}
      navigate(`/?ref=${cleanBjp}&rid=${cleanRid}`, { replace: true })
    } else {
      navigate('/', { replace: true })
    }
  }, [bjpCode, referralId, navigate])

  return null
}
