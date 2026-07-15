import axios from 'axios'

const api = axios.create({
  // Support VITE_API_URL env var for pointing at staging/production API.
  // Falls back to same-origin (empty string) when not set — works when
  // frontend and backend are co-served.
  baseURL: import.meta.env.VITE_API_URL || '',
  withCredentials: true,
  timeout: 30000,
})

// ── CSRF token handling for admin mutating requests (FIX-08) ──────
let _csrfToken = null
async function ensureCsrfToken() {
  if (_csrfToken) return _csrfToken
  const base = import.meta.env.VITE_API_URL || ''
  const res = await axios.get(base + '/admin/api/csrf-token', { withCredentials: true })
  _csrfToken = res.data && res.data.csrfToken ? res.data.csrfToken : null
  return _csrfToken
}

api.interceptors.request.use(async (cfg) => {
  const url = cfg.url || ''
  const method = (cfg.method || 'get').toLowerCase()
  const mutating = ['post', 'put', 'patch', 'delete'].includes(method)
  // Admin login endpoints (login/send-otp/verify-otp) run pre-auth and are
  // CSRF-exempt on the server — don't try to attach a token to them.
  const isAdminAuthRoute = url.includes('/admin/api/login') ||
                           url.includes('/admin/api/send-otp') ||
                           url.includes('/admin/api/verify-otp')
  if (mutating && url.startsWith('/admin/api') && !isAdminAuthRoute) {
    try {
      const token = await ensureCsrfToken()
      if (token) {
        cfg.headers = cfg.headers || {}
        cfg.headers['x-csrf-token'] = token
      }
    } catch (_) { /* proceed; server will 403 if token is required */ }
  }
  return cfg
})

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response) {
      // Stale/invalid CSRF token → drop the cache so the next attempt refetches
      if (error.response.status === 403) _csrfToken = null
      return Promise.reject(error.response.data || { message: 'Server error' })
    }
    if (error.code === 'ECONNABORTED') {
      return Promise.reject({ message: 'Request timed out. Please try again.' })
    }
    return Promise.reject({ message: 'Network error. Please check your connection.' })
  }
)

export const chat = {
  sendOtp: (mobile) =>
    api.post('/api/send-otp', { mobile }),

  verifyOtp: (mobile, otp) =>
    api.post('/api/verify-otp', { mobile, otp }),

  checkMobile: (mobile) =>
    api.post('/api/check-mobile', { mobile }),

  validateEpic: (epicNo, mobile) =>
    api.post('/api/validate-epic', { epic_no: epicNo, mobile }),

  // Get a presigned URL to upload the photo directly to Backblaze B2
  getPhotoUploadUrl: (epicNo, mobile) =>
    api.post('/api/photo-upload-url', { epic_no: epicNo, mobile }),

  // Upload the photo blob straight to B2 (bypasses our server). Uses the raw
  // axios instance so no auth/CSRF/baseURL interceptors are applied.
  uploadPhotoToB2: (uploadUrl, blob) =>
    axios.put(uploadUrl, blob, {
      headers: { 'Content-Type': 'image/jpeg' },
      timeout: 60000,
      withCredentials: false,
    }),

  // Accepts either a JSON object (presigned path, photo already in B2) or a
  // FormData (legacy multipart fallback).
  generateCard: (data) =>
    (typeof FormData !== 'undefined' && data instanceof FormData)
      ? api.post('/api/generate-card', data, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 })
      : api.post('/api/generate-card', data, { timeout: 120000 }),

  profile: (epicNo, mobile) =>
    api.get(`/api/profile/${epicNo}`, { params: { mobile } }),

  getBooth: (epicNo) =>
    api.get(`/api/booth/${epicNo}`),

  getReferralLink: (bjpCode) =>
    api.get(`/api/referral-link/${bjpCode}`),

  getMyMembers: (bjpCode) =>
    api.get(`/api/my-members/${bjpCode}`),

  getBestPerformers: () =>
    api.get('/api/best-performers'),

  getDistrictsData: () =>
    api.get('/api/districts-data'),

  getRequestStatus: (bjpCode) =>
    api.get(`/api/request-status/${bjpCode}`),

  requestVolunteer: (bjpCode, epicNo, wing) =>
    api.post('/api/request-volunteer', { bjp_code: bjpCode, epic_no: epicNo, wing }),

  requestBoothAgent: (bjpCode, epicNo, boothNo, assembly, district) =>
    api.post('/api/request-booth-agent', {
      bjp_code: bjpCode,
      epic_no: epicNo,
      booth_no: boothNo,
      assembly,
      district,
    }),

  getMemberStatus: (bjpCode) =>
    api.get(`/api/member-status/${bjpCode}`),

  bookAppointment: (bjpCode, date, time) =>
    api.post('/api/book-appointment', { bjp_code: bjpCode, date, time }),

  saveLocalBodyInterest: (bjpCode, interest) =>
    api.post('/api/local-body-interest', { bjp_code: bjpCode, interest }),

  saveMeetingInterest: (bjpCode, interest) =>
    api.post('/api/save-meeting-interest', { bjp_code: bjpCode, interest }),

  logout: () =>
    api.post('/api/logout'),
}

export const admin = {
  // OTP-based admin login (restricted to whitelisted mobile numbers)
  sendOtp: (mobile) =>
    api.post('/admin/api/send-otp', { mobile }),

  verifyOtp: (mobile, otp) =>
    api.post('/admin/api/verify-otp', { mobile, otp }),

  logout: () =>
    api.post('/admin/api/logout'),

  // Lightweight session check — use instead of getStats() for auth probe
  getSession: () =>
    api.get('/admin/api/session'),

  getStats: () =>
    api.get('/admin/api/stats'),

  getExternalStats: () =>
    api.get('/admin/api/external-stats'),

  getVoters: (params) =>
    api.get('/admin/api/voters', { params }),

  getVoterDetail: (epicNo) =>
    api.get(`/admin/api/voters/${epicNo}`),

  getGeneratedVoters: (params) =>
    api.get('/admin/api/generated-voters', { params }),

  getGeneratedVoterDetail: (bjpCode) =>
    api.get(`/admin/api/generated-voters/${bjpCode}`),

  getVolunteerRequests: (params) =>
    api.get('/admin/api/volunteer-requests', { params }),

  confirmVolunteer: (bjpCode) =>
    api.post(`/admin/api/volunteer-requests/${bjpCode}/confirm`),

  rejectVolunteer: (bjpCode) =>
    api.post(`/admin/api/volunteer-requests/${bjpCode}/reject`),

  getConfirmedVolunteers: (params) =>
    api.get('/admin/api/confirmed-volunteers', { params }),

  getBoothAgentRequests: (params) =>
    api.get('/admin/api/booth-agent-requests', { params }),

  confirmBoothAgent: (bjpCode) =>
    api.post(`/admin/api/booth-agent-requests/${bjpCode}/confirm`),

  rejectBoothAgent: (bjpCode) =>
    api.post(`/admin/api/booth-agent-requests/${bjpCode}/reject`),

  getConfirmedBoothAgents: (params) =>
    api.get('/admin/api/confirmed-booth-agents', { params }),

  getReports: (params) =>
    api.get('/admin/api/reports', { params }),

  getLocalBody: (params) =>
    api.get('/admin/api/local-body', { params }),

  getMeetRequests: (params) =>
    api.get('/admin/api/meet-requests', { params }),
}

export const publicApi = {
  verifyVoter: (epicNo) =>
    api.get(`/api/verify/${epicNo}`),

  getCardData: (epicNo) =>
    api.get(`/api/card/${epicNo}`),
}
