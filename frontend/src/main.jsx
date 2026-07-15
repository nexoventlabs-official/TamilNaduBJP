import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import App from './App'
import './styles/global.css'

// DSN comes from the VITE_SENTRY_DSN build-time env var. If it's not provided,
// Sentry is simply not initialised (no error monitoring, no crash).
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,

    // Sample 10% of transactions to stay within the Sentry free tier
    tracesSampleRate: 0.1,

    // Environment tracking (production vs development)
    environment: import.meta.env.MODE || 'development',

    // Release tracking — __APP_VERSION__ is injected via vite.config.js
    release: `tnbjp-frontend@${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'}`,

    // Security: scrub sensitive fields before anything leaves the browser
    beforeSend(event) {
      const sensitiveFields = ['otp', 'pin', 'new_pin', 'password']
      if (event.request && event.request.data) {
        sensitiveFields.forEach((field) => {
          if (event.request.data[field] !== undefined) {
            event.request.data[field] = '[REDACTED]'
          }
        })
      }
      return event
    },
  })
} else if (import.meta.env.DEV) {
  console.warn('[Sentry] VITE_SENTRY_DSN not set — error monitoring disabled.')
}

function ErrorFallback() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '24px',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
      <p style={{ color: '#666', marginBottom: 16 }}>
        An unexpected error occurred. Please reload the page and try again.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '10px 20px',
          borderRadius: 8,
          border: 'none',
          background: '#138808',
          color: '#fff',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Reload
      </button>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
)
