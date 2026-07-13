import React, { useState, useEffect, useRef, useCallback } from 'react'
import QRCode from 'qrcode'
import { useNavigate } from 'react-router-dom'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import { chat, publicApi } from '../api'
import { FlipCard3D } from '../components/FlipCard3D'
import html2canvas from 'html2canvas'
import '../styles/chatbot.css'

// ── Read referral params from landing URL (?ref=WTL-XXXX&rid=REF-XXXX)
const getReferralParams = () => {
  try {
    const p = new URLSearchParams(window.location.search)
    let ref = (p.get('ref') || '').trim().toUpperCase()
    let rid = (p.get('rid') || '').trim().toUpperCase()
    // Validate format before using
    if (/^(WTL|BJP)-[0-9A-F]{8}$/.test(ref) && /^REF-[0-9A-F]{8}$/.test(rid)) {
      return { ref, rid }
    }

    // Check localStorage as fallback
    const stored = localStorage.getItem('wtl_referral')
    if (stored) {
      const data = JSON.parse(stored)
      // Check if it's less than 24 hours old
      if (data && Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
        const storedRef = (data.wtlCode || '').trim().toUpperCase()
        const storedRid = (data.referralId || '').trim().toUpperCase()
        if (/^(WTL|BJP)-[0-9A-F]{8}$/.test(storedRef) && /^REF-[0-9A-F]{8}$/.test(storedRid)) {
          return { ref: storedRef, rid: storedRid }
        }
      }
    }
  } catch { /* ignore */ }
  return { ref: '', rid: '' }
}

// ── Constants ──────────────────────────────────────────────
const S = {
  WELCOME:       'WELCOME',
  AWAIT_MOBILE:  'AWAIT_MOBILE',
  AWAIT_EPIC:    'AWAIT_EPIC',
  CONFIRM:       'CONFIRM',
  AWAIT_PHOTO:   'AWAIT_PHOTO',
  GENERATING:    'GENERATING',
  DONE:          'DONE',
  AWAIT_BOOTH_NO:'AWAIT_BOOTH_NO',
}

const CACHE_KEY = 'bjp_card_cache'
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000

const getCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (Date.now() - data.timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY)
      return null
    }
    return data
  } catch { return null }
}

const saveCache = (card, profile) =>
  localStorage.setItem(CACHE_KEY, JSON.stringify({ card, profile, timestamp: Date.now() }))

const clearCache = () => localStorage.removeItem(CACHE_KEY)

const maskMobile = (m) => m ? m.slice(0, 5) + 'XXXXX' : ''

const getDownloadUrl = (url, epicNo) => {
  if (url && url.includes('/upload/')) {
    return url.replace('/upload/', `/upload/fl_attachment:${epicNo}_WTL_Card/`)
  }
  return url
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const fmtTime = (d) =>
  d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''

const getActiveStep = (chatState) => {
  switch (chatState) {
    case 'WELCOME':
    case 'AWAIT_MOBILE':
      return 1
    case 'AWAIT_EPIC':
    case 'CONFIRM':
      return 2
    case 'AWAIT_PHOTO':
    case 'GENERATING':
      return 3
    case 'DONE':
      return 4
    default:
      return 1
  }
}

// ── Crop Modal ──────────────────────────────────────────────
function CropModal({ src, onCrop, onCancel }) {
  const imgRef = useRef(null)
  const cropperRef = useRef(null)

  useEffect(() => {
    if (!imgRef.current || !src) return
    const img = imgRef.current

    const initCropper = () => {
      cropperRef.current = new Cropper(img, {
        aspectRatio: 268 / 384,
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 0.9,
        responsive: true,
        background: false,
        guides: true,
        center: true,
      })
    }

    if (img.complete) {
      initCropper()
    } else {
      img.onload = initCropper
    }

    return () => {
      cropperRef.current?.destroy()
      cropperRef.current = null
    }
  }, [src])

  const handleCrop = () => {
    if (!cropperRef.current) return
    cropperRef.current.getCroppedCanvas({ width: 536, height: 768, imageSmoothingQuality: 'high' })
      .toBlob((blob) => onCrop(blob), 'image/jpeg', 0.93)
  }

  return (
    <div className="crop-overlay">
      <div className="crop-modal">
        <div className="crop-modal-header">
          <h5><i className="bi bi-crop" /> Crop Your Photo</h5>
          <button className="crop-close-btn" onClick={onCancel}><i className="bi bi-x-lg" /></button>
        </div>
        <div className="crop-modal-body">
          <img ref={imgRef} src={src} alt="Crop preview" style={{ display: 'block', maxWidth: '100%' }} />
        </div>
        <div className="crop-modal-footer">
          <span className="crop-hint"><i className="bi bi-info-circle" /> Drag to adjust. Aspect ratio 2.68:3.84.</span>
          <button className="btn btn-sm btn-outline-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-sm btn-danger" onClick={handleCrop}>
            <i className="bi bi-check-lg" /> Use Photo
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Message renderers ───────────────────────────────────────
function WelcomeBannerMsg({ onStart }) {
  return (
    <div className="welcome-banner">
      <img src="/banner.png" alt="BJP Tamil Nadu" className="banner-img"
        loading="lazy"
        onError={(e) => { e.target.style.display = 'none' }} />
      <div className="banner-content">
        <h2>World's Largest. India's Biggest. Soon to be Tamil Nadu's No. 1.</h2>
        <p>You are joining the world's leading political organization. Click below to generate your personalized Member Card.</p>
        <button className="btn-start" onClick={onStart}>
          <i className="bi bi-play-circle-fill" /> Start
        </button>
      </div>
    </div>
  )
}

function VoterCardMsg({ voter, isLatest, chatState, onConfirm, onRetry, disabled }) {
  const v = voter || {}
  const rows = [
    { label: 'Name',         value: v.name || v.Name || v.voter_name },
    { label: "Father's Name", value: v.father_name || v.FatherName || v.RelationName },
    { label: 'EPIC No',       value: v.epic_no || v.EpicNo || v.EPIC_NO },
    { label: 'Age / Gender',  value: [v.age || v.Age, v.gender || v.Gender].filter(Boolean).join(' / ') || undefined },
    { label: 'Assembly',      value: v.assembly || v.AssemblyName || v.assembly_name },
    { label: 'District',      value: v.district || v.DistrictName || v.district_name },
    { label: 'Part No',       value: v.part_no || v.PartNo },
    { label: 'Serial No',     value: v.serial_no || v.SlNo },
  ].filter((r) => r.value)

  const showButtons = isLatest && chatState === 'CONFIRM'

  return (
    <div className="voter-details-card">
      <div className="vdc-header">
        <i className="bi bi-person-badge" /> Voter Details
      </div>
      <div className="vdc-body">
        {rows.map((r) => (
          <div className="vdc-row" key={r.label}>
            <span className="vdc-label">{r.label}</span>
            <span className="vdc-value">{r.value}</span>
          </div>
        ))}
      </div>
      {showButtons && (
        <div className="interactive-buttons">
          <button className="interactive-btn" onClick={onConfirm} disabled={disabled}>
            <i className="bi bi-check-circle-fill" /> Confirm Details
          </button>
          <button className="interactive-btn" onClick={onRetry} disabled={disabled} style={{ color: '#d32f2f' }}>
            <i className="bi bi-arrow-counterclockwise" /> Re-enter ID
          </button>
        </div>
      )}
    </div>
  )
}

// ── Referral Link Message ────────────────────────────────────
function FullReferralPanel({ link, onBack }) {
  const canvasRef = useRef(null)
  const [copied, setCopied] = useState(false)
  const [qrReady, setQrReady] = useState(false)

  useEffect(() => {
    if (!link || !canvasRef.current) return
    const canvas = canvasRef.current
    const size = 280
    QRCode.toCanvas(canvas, link, {
      width: size,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'H'
    }, (err) => {
      if (err) return
      // Overlay BJP logo in center
      const ctx = canvas.getContext('2d')
      const img = new Image()
      img.src = '/bjp_logo.svg'
      img.onload = () => {
        const logoSize = size * 0.22
        const logoX = (size - logoSize) / 2
        const logoY = (size - logoSize) / 2
        // White background circle
        ctx.save()
        ctx.beginPath()
        ctx.arc(size / 2, size / 2, logoSize * 0.62, 0, Math.PI * 2)
        ctx.fillStyle = '#ffffff'
        ctx.fill()
        ctx.restore()
        ctx.drawImage(img, logoX, logoY, logoSize, logoSize)
        setQrReady(true)
      }
      img.onerror = () => setQrReady(true)
    })
  }, [link])

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(link).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleShareWhatsApp = () => {
    if (!link || !canvasRef.current) return
    // WhatsApp bold markdown: *text*
    const shareText = `*🪷 Join BJP Tamil Nadu!*\n\n*Generate your free Digital Member ID Card here:*\n${link}`
    // Try Web Share API (mobile) — sends QR image + text as a single share
    if (navigator.canShare && canvasRef.current) {
      canvasRef.current.toBlob((blob) => {
        const file = new File([blob], 'bjp-referral-qr.png', { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          navigator.share({
            title: '🪷 Join BJP Tamil Nadu!',
            text: shareText,
            files: [file]
          }).catch(() => {
            // Fallback: open WhatsApp text-only
            window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank')
          })
          return
        }
        // Device supports share but not file share — text only
        window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank')
      }, 'image/png', 1.0)
    } else {
      // Desktop fallback — open WhatsApp with text+link
      window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank')
    }
  }

  const handleDownloadQR = () => {
    if (!canvasRef.current) return
    const a = document.createElement('a')
    a.download = 'bjp-referral-qr.png'
    a.href = canvasRef.current.toDataURL('image/png')
    a.click()
  }

  return (
    <div className="chatbot-container brochure-panel">
      <header className="brochure-header">
        <div className="brochure-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', color: 'var(--color-ash)', cursor: 'pointer', padding: '4px 8px 4px 0', fontSize: '18px', display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-chalk)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-ash)'}
            aria-label="Back"
          >
            <i className="bi bi-chevron-left" />
          </button>
          <i className="bi bi-link-45deg brochure-title-orange" />
          <span>Referral Link</span>
        </div>
      </header>

      <div className="brochure-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '24px 20px', gap: 20 }}>
        {link ? (
          <>
            {/* QR Code Canvas */}
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <div style={{
                background: '#fff',
                borderRadius: 16,
                padding: 12,
                boxShadow: '0 4px 24px rgba(0,0,0,0.13)',
                display: 'inline-block'
              }}>
                <canvas ref={canvasRef} style={{ display: 'block', borderRadius: 8 }} />
              </div>
              {!qrReady && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 28, height: 28, border: '3px solid rgba(242,101,34,0.2)', borderTopColor: '#f26522', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                </div>
              )}
            </div>

            {/* Caption */}
            <p style={{ fontSize: 13, color: 'var(--color-ash)', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
              <i className="bi bi-qr-code me-1" style={{ color: '#f26522' }} />
              Scan this QR to join BJP Tamil Nadu
            </p>

            {/* Link Box */}
            <div style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 12,
              color: 'var(--color-chalk)',
              wordBreak: 'break-all',
              width: '100%',
              maxWidth: 320,
              textAlign: 'center'
            }}>
              {link}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 320 }}>
              <button
                onClick={handleCopyLink}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: copied ? 'rgba(46,204,113,0.15)' : 'rgba(255,255,255,0.07)', color: copied ? '#2ecc71' : 'var(--color-chalk)', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
              >
                <i className={`bi bi-${copied ? 'check-lg' : 'clipboard'}`} />
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
              <button
                onClick={handleShareWhatsApp}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 10, border: 'none', background: '#25d366', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                <i className="bi bi-whatsapp" /> Share on WhatsApp
              </button>
              <button
                onClick={handleDownloadQR}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 10, border: '1px solid rgba(242,101,34,0.4)', background: 'rgba(242,101,34,0.08)', color: '#f26522', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                <i className="bi bi-download" /> Download QR Code
              </button>
            </div>

            <p style={{ fontSize: 12, color: 'var(--color-ash)', textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
              <i className="bi bi-people-fill" style={{ color: '#f26522', marginRight: 4 }} />
              Everyone who joins via your link or QR appears in your <strong style={{ color: 'var(--color-chalk)' }}>My Members</strong> list.
            </p>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-ash)', fontSize: 13 }}>
            <i className="bi bi-exclamation-circle me-2" /> No referral link available.
          </div>
        )}
      </div>
    </div>
  )
}

function GeneratedCardMsg({ card, isNew = false }) {  const c = card || {}
  const [fullCardData, setFullCardData] = useState(null)

  useEffect(() => {
    const hasName = c.name || c.voter_name || c.VOTER_NAME;
    const hasAssembly = c.assembly_name || c.assembly || c.ASSEMBLY_NAME;
    if (hasName && hasAssembly) {
      setFullCardData(c)
    } else if (c.epic_no) {
      publicApi.getCardData(c.wtl_code || c.epic_no)
        .then((data) => setFullCardData(data))
        .catch(() => setFullCardData(c))
    }
  }, [c])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      {fullCardData ? (
        <FlipCard3D
          cardData={fullCardData}
          backUrl={c.back_url || fullCardData.back_url}
          width={300}
          autoFlip={isNew}
          showActions={true}
        />
      ) : (
        <div className="card-skeleton">
          <style>{`
            .card-skeleton {
              background: #f9f8f6;
              width: 300px;
              height: 190px;
              border-radius: 12px;
              padding: 16px;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              border: 1px solid rgba(0, 0, 0, 0.08);
              overflow: hidden;
            }

            @keyframes pulse {
              0%, 100% { opacity: 0.8; }
              50% { opacity: 0.4; }
            }

            .skeleton-logo,
            .skeleton-line,
            .skeleton-photo,
            .skeleton-qr {
              background: rgba(0, 0, 0, 0.08);
              border-radius: 4px;
              animation: pulse 1.5s infinite ease-in-out;
            }

            .skeleton-header {
              display: flex;
              align-items: center;
              gap: 12px;
              height: 32px;
            }

            .skeleton-logo {
              width: 28px;
              height: 28px;
              border-radius: 50%;
            }

            .skeleton-title-lines {
              display: flex;
              flex-direction: column;
              gap: 6px;
              flex: 1;
            }

            .title-l1 {
              width: 60%;
              height: 8px;
            }

            .title-l2 {
              width: 40%;
              height: 6px;
            }

            .skeleton-body {
              display: flex;
              align-items: center;
              gap: 12px;
              flex: 1;
              margin-top: 14px;
            }

            .skeleton-photo {
              width: 64px;
              height: 78px;
              border-radius: 6px;
            }

            .skeleton-details {
              display: flex;
              flex-direction: column;
              gap: 8px;
              flex: 1;
            }

            .detail-line {
              width: 90%;
              height: 6px;
            }
            .detail-line:nth-child(2) { width: 75%; }
            .detail-line:nth-child(3) { width: 85%; }
            .detail-line:nth-child(4) { width: 50%; }

            .skeleton-qr {
              width: 48px;
              height: 48px;
              border-radius: 6px;
              align-self: flex-end;
            }
          `}</style>
          <div className="skeleton-header">
            <div className="skeleton-logo"></div>
            <div className="skeleton-title-lines">
              <div className="skeleton-line title-l1"></div>
              <div className="skeleton-line title-l2"></div>
            </div>
          </div>
          <div className="skeleton-body">
            <div className="skeleton-photo"></div>
            <div className="skeleton-details">
              <div className="skeleton-line detail-line"></div>
              <div className="skeleton-line detail-line"></div>
              <div className="skeleton-line detail-line"></div>
              <div className="skeleton-line detail-line"></div>
            </div>
            <div className="skeleton-qr"></div>
          </div>
        </div>
      )}
    </div>
  )
}

const triggerPDFDownload = (iframeId, fileName) => {
  const iframe = document.getElementById(iframeId);
  if (!iframe || !iframe.contentWindow) return;

  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const isMobileSafari = isIOS || isSafari;
  
  // Check if Web Share API with files is likely supported.
  const isShareSupported = typeof navigator.share === 'function' && typeof navigator.canShare === 'function';

  let iosWin = null;
  if (isMobileSafari && !isShareSupported) {
    try {
      iosWin = window.open('', '_blank');
      if (iosWin) {
        iosWin.document.write('<html><head><title>Generating PDF...</title><style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;background:#f5f5f5;color:#333;font-size:18px;text-align:center;padding:20px;box-sizing:border-box;}.spinner{border:4px solid rgba(0,0,0,0.1);width:36px;height:36px;border-radius:50%;border-left-color:#ff6600;animation:spin 1s linear infinite;margin-bottom:20px;}@keyframes spin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}</style></head><body><div class="spinner"></div><p>Generating PDF, please wait...</p></body></html>');
        iosWin.document.close();
      }
      window.iosWin = iosWin;
    } catch (e) {
      console.warn('Failed to pre-open window on iOS', e);
    }
  }

  if (typeof iframe.contentWindow.downloadPDF === 'function') {
    iframe.contentWindow.downloadPDF(fileName, iosWin);
  } else {
    if (iosWin) iosWin.close();
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  }
};

function WelcomeLetterMsg({ name, date, refCode, autoDownload }) {
  const safeId = name.replace(/[^a-zA-Z0-9]/g, '-')
  const wrapperRef = useRef(null)
  
  const handlePrint = () => {
    triggerPDFDownload(`welcome-iframe-${safeId}`, `Welcome_Letter_${name}`);
  }

  const hasDownloaded = useRef(false)

  useEffect(() => {
    if (autoDownload && !hasDownloaded.current) {
      const timer = setTimeout(() => {
        hasDownloaded.current = true
        triggerPDFDownload(`welcome-iframe-${safeId}`, `Welcome_Letter_${name}`);
      }, 3500)
      return () => clearTimeout(timer)
    }
  }, [autoDownload, name, safeId])

  const letterUrl = `/Welcome_letter.html?name=${encodeURIComponent(name)}&date=${encodeURIComponent(date)}&ref=${encodeURIComponent(refCode || '')}&lang=ta&hideControls=true&apiUrl=${encodeURIComponent(import.meta.env.VITE_API_URL || '')}&v=1.0.4`

  return (
    <div ref={wrapperRef} style={{
      background: 'var(--color-carbon)',
      border: '1.5px solid rgba(19, 136, 8, 0.25)',
      borderRadius: '20px',
      padding: '16px',
      width: '320px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      backdropFilter: 'blur(8px)'
    }}>
      {/* File Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '10px',
          background: 'rgba(19, 136, 8, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid rgba(19, 136, 8, 0.2)',
          flexShrink: 0
        }}>
          <i className="bi bi-file-earmark-pdf-fill" style={{ color: 'var(--color-signal-mint)', fontSize: 20 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: 'left' }}>
          <span style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--color-chalk)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>Welcome_Letter.pdf</span>
          <span style={{ fontSize: 9, color: 'var(--color-ash)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{date}</span>
        </div>
      </div>

      {/* Embedded Iframe Preview */}
      <div style={{
        width: '100%',
        height: '420px',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid var(--color-graphite)',
        background: '#fff',
        position: 'relative'
      }}>
        <iframe 
          id={`welcome-iframe-${safeId}`}
          src={letterUrl} 
          style={{ 
            width: '100%', 
            height: '100%', 
            border: 'none',
            transform: 'scale(1.0)',
            transformOrigin: 'top left'
          }} 
          title="Welcome Letter Preview"
          onLoad={(e) => {
            try {
              const iframe = e.target;
              const doc = iframe.contentDocument || iframe.contentWindow.document;
              const controls = doc.querySelector('.controls-container');
              if (controls) controls.style.display = 'none';
            } catch(err) {}
          }}
        />
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handlePrint}
          style={{
            flex: 1,
            background: 'linear-gradient(135deg, #138808 0%, #0c5b05 100%)',
            color: '#fff',
            border: 'none',
            padding: '10px 14px',
            borderRadius: '12px',
            fontSize: 11,
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'all 0.15s'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'none' }}
        >
          <i className="bi bi-file-earmark-pdf-fill" /> Download PDF
        </button>
      </div>
    </div>
  )
}

function ReferralLinkMsg({ link }) {
  const canvasRef = useRef(null)
  const [copied, setCopied] = useState(false)
  const [qrReady, setQrReady] = useState(false)

  useEffect(() => {
    if (!link || !canvasRef.current) return
    const canvas = canvasRef.current
    const size = 180
    QRCode.toCanvas(canvas, link, {
      width: size,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'H'
    }, (err) => {
      if (err) return
      const ctx = canvas.getContext('2d')
      const img = new Image()
      img.src = '/bjp_logo.svg'
      img.onload = () => {
        const logoSize = size * 0.22
        const logoX = (size - logoSize) / 2
        const logoY = (size - logoSize) / 2
        ctx.save()
        ctx.beginPath()
        ctx.arc(size / 2, size / 2, logoSize * 0.62, 0, Math.PI * 2)
        ctx.fillStyle = '#ffffff'
        ctx.fill()
        ctx.restore()
        ctx.drawImage(img, logoX, logoY, logoSize, logoSize)
        setQrReady(true)
      }
      img.onerror = () => setQrReady(true)
    })
  }, [link])

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(link).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleShareWhatsApp = () => {
    if (!link) return
    const shareText = `*🪷 Join BJP Tamil Nadu!*\n\n*Generate your free Digital Member ID Card here:*\n${link}`
    if (navigator.canShare && canvasRef.current) {
      canvasRef.current.toBlob((blob) => {
        const file = new File([blob], 'bjp-referral-qr.png', { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          navigator.share({
            title: '🪷 Join BJP Tamil Nadu!',
            text: shareText,
            files: [file]
          }).catch(() => {
            window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank')
          })
          return
        }
        window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank')
      }, 'image/png', 1.0)
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '8px 4px' }}>
      <div style={{ color: 'var(--color-ash)', fontSize: 13, textAlign: 'center', fontWeight: 500, lineHeight: 1.5 }}>
        🪷 Here is your referral link and QR code! Share this to invite others and build your team:
      </div>
      
      {/* QR Code */}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <div style={{
          background: '#fff',
          borderRadius: 12,
          padding: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          display: 'inline-block'
        }}>
          <canvas ref={canvasRef} style={{ display: 'block', borderRadius: 6, width: 180, height: 180 }} />
        </div>
        {!qrReady && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner-border spinner-border-sm text-warning" />
          </div>
        )}
      </div>

      {/* Referral Link Box */}
      <div style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 12,
        color: 'var(--color-chalk)',
        wordBreak: 'break-all',
        width: '100%',
        textAlign: 'center',
        fontFamily: 'monospace'
      }}>
        {link}
      </div>

      {/* Share / Copy Buttons */}
      <div style={{ display: 'flex', gap: 8, width: '100%' }}>
        <button
          onClick={handleCopyLink}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.15)',
            background: copied ? 'rgba(46,204,113,0.15)' : 'rgba(255,255,255,0.07)',
            color: copied ? '#2ecc71' : 'var(--color-chalk)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <i className={`bi bi-${copied ? 'check-lg' : 'clipboard'}`} />
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
        <button
          onClick={handleShareWhatsApp}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '10px 14px',
            borderRadius: 8,
            border: 'none',
            background: '#25d366',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          <i className="bi bi-whatsapp" /> Share WhatsApp
        </button>
      </div>
    </div>
  )
}

function AppreciationLetterMsg({ name, date, refCode, autoDownload }) {
  const safeId = name.replace(/[^a-zA-Z0-9]/g, '-')
  
  const handlePrint = () => {
    triggerPDFDownload(`appreciation-iframe-${safeId}`, `Appreciation_Letter_${name}`);
  }

  const hasDownloaded = useRef(false)

  useEffect(() => {
    if (autoDownload && !hasDownloaded.current) {
      const timer = setTimeout(() => {
        hasDownloaded.current = true
        triggerPDFDownload(`appreciation-iframe-${safeId}`, `Appreciation_Letter_${name}`);
      }, 3500)
      return () => clearTimeout(timer)
    }
  }, [autoDownload, name, safeId])

  const letterUrl = `/Appreciation_letter.html?name=${encodeURIComponent(name)}&date=${encodeURIComponent(date)}&ref=${encodeURIComponent(refCode || '')}&lang=ta&hideControls=true&apiUrl=${encodeURIComponent(import.meta.env.VITE_API_URL || '')}&v=1.0.4`

  return (
    <div style={{
      background: 'var(--color-carbon)',
      border: '1.5px solid rgba(19, 136, 8, 0.25)',
      borderRadius: '20px',
      padding: '16px',
      width: '320px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      backdropFilter: 'blur(8px)'
    }}>
      {/* File Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '10px',
          background: 'rgba(19, 136, 8, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid rgba(19, 136, 8, 0.2)',
          flexShrink: 0
        }}>
          <i className="bi bi-file-earmark-pdf-fill" style={{ color: 'var(--color-signal-mint)', fontSize: 20 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: 'left' }}>
          <span style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--color-chalk)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>Appreciation_Letter.pdf</span>
          <span style={{ fontSize: 9, color: 'var(--color-ash)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{date}</span>
        </div>
      </div>

      {/* Embedded Iframe Preview */}
      <div style={{
        width: '100%',
        height: '420px',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid var(--color-graphite)',
        background: '#fff',
        position: 'relative'
      }}>
        <iframe 
          id={`appreciation-iframe-${safeId}`}
          src={letterUrl} 
          style={{ 
            width: '100%', 
            height: '100%', 
            border: 'none',
            transform: 'scale(1.0)',
            transformOrigin: 'top left'
          }} 
          title="Appreciation Letter Preview"
          onLoad={(e) => {
            try {
              const iframe = e.target;
              const doc = iframe.contentDocument || iframe.contentWindow.document;
              const controls = doc.querySelector('.controls-container');
              if (controls) controls.style.display = 'none';
            } catch(err) {}
          }}
        />
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handlePrint}
          style={{
            flex: 1,
            background: 'linear-gradient(135deg, #138808 0%, #0c5b05 100%)',
            color: '#fff',
            border: 'none',
            padding: '10px 14px',
            borderRadius: '12px',
            fontSize: 11,
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'all 0.15s'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'none' }}
        >
          <i className="bi bi-file-earmark-pdf-fill" /> Download PDF
        </button>
      </div>
    </div>
  )
}

function SelectWingMsg({ wtlCode, epicNo, isLatest }) {
  const [selectedWing, setSelectedWing] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [statusText, setStatusText] = useState('')
  const [existingRequest, setExistingRequest] = useState(null)

  const wings = [
    "Bharatiya Janata Yuva Morcha (BJYM)",
    "BJP Mahila Morcha",
    "OBC Morcha",
    "SC Morcha",
    "ST Morcha",
    "Kisan Morcha",
    "Minority Morcha",
    "Arts and Culture Wing",
    "NGO Wing",
    "Intellectual Cell / Teachers & Professionals Cell",
    "Weavers and Artisans Cell",
    "Fishermen Cell",
    "Traders and Business Cell",
    "Ex-Servicemen Cell",
    "Overseas Friends of BJP (OFBJP) / NRI Cell",
    "Information Technology (IT) & Social Media Wing",
    "Co-Operative Cell",
    "Sports & Skill Development Cell",
    "Medical & Doctors Cell",
    "Legal & Advocates Cell",
    "Local Bodies Cell"
  ]

  useEffect(() => {
    if (!wtlCode) {
      setChecking(false)
      return
    }
    chat.getRequestStatus(wtlCode)
      .then(res => {
        if (res.success && res.volunteer) {
          setExistingRequest(res.volunteer)
          setSubmitted(true)
        }
      })
      .catch(err => {
        console.error('Error fetching request status:', err)
      })
      .finally(() => {
        setChecking(false)
      })
  }, [wtlCode])

  const handleSubmit = async () => {
    if (!selectedWing) return
    setLoading(true)
    try {
      const res = await chat.requestVolunteer(wtlCode, epicNo, selectedWing)
      setSubmitted(true)
      setStatusText(res.message || '✅ Organizer request submitted! Admin will review it shortly.')
    } catch (err) {
      setStatusText(`❌ ${err.message || 'Unable to submit request. Please try again.'}`)
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <div style={{ width: 32, height: 32, border: '3px solid rgba(46, 204, 113, 0.15)', borderTopColor: 'var(--color-signal-mint)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <div style={{ fontSize: 13, color: 'var(--color-ash)', marginTop: 12 }}>Checking status...</div>
      </div>
    )
  }

  return (
    <div style={{ 
      width: '100%', 
      maxWidth: '600px',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 24
    }}>
      {/* Role Header Description */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: 'rgba(255, 153, 51, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px auto'
        }}>
          <i className="bi bi-hand-thumbs-up-fill" style={{ fontSize: 36, color: '#FF9933' }} />
        </div>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-chalk)', marginBottom: 8 }}>BJP Organizer Wing</h3>
        <p style={{ fontSize: 13, color: 'var(--color-ash)', lineHeight: '1.6', margin: '0 auto', maxWidth: '480px' }}>
          As a BJP Organizer, you play a pivotal role in strengthening the party's foundation. Select your preferred Wing to lead local initiatives, mobilize community support, and drive organizational progress across Tamil Nadu.
        </p>
      </div>

      {existingRequest ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          {/* Custom SVG Pending / Success Spinner */}
          <div style={{ position: 'relative', width: 80, height: 80 }}>
            {existingRequest.status === 'confirmed' ? (
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            ) : (
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#FF9933" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="pending-svg">
                <circle cx="12" cy="12" r="10" style={{ strokeDasharray: '60', strokeDashoffset: '20', animation: 'spin-pending 3s linear infinite' }} />
                <polyline points="12 6 12 12 15 15" />
              </svg>
            )}
          </div>

          <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: 'var(--color-chalk)' }}>
            Status: <span style={{ textTransform: 'capitalize', color: existingRequest.status === 'confirmed' ? '#2ecc71' : existingRequest.status === 'rejected' ? '#dc2626' : '#FF9933' }}>{existingRequest.status}</span>
          </div>

          {/* Grid fields */}
          <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <div style={{ 
              background: 'var(--color-carbon)', 
              border: '1px solid var(--color-graphite)',
              borderRadius: 12,
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-ash)' }}>
                <i className="bi bi-tag-fill" style={{ color: '#FF9933' }} />
                <span>Assigned Wing</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-chalk)' }}>{existingRequest.wing}</span>
            </div>

            <div style={{ 
              background: 'var(--color-carbon)', 
              border: '1px solid var(--color-graphite)',
              borderRadius: 12,
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-ash)' }}>
                <i className="bi bi-clock-history" style={{ color: '#FF9933' }} />
                <span>Application Status</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-chalk)' }}>
                {existingRequest.status === 'confirmed' ? 'Approved & Activated' : 'Pending Admin Verification'}
              </span>
            </div>
          </div>
        </div>
      ) : !submitted ? (
        <div style={{ 
          background: 'var(--color-carbon)',
          border: '1px solid var(--color-graphite)',
          borderRadius: 16,
          padding: '24px 20px',
          width: '100%',
          maxWidth: '440px',
          margin: '0 auto'
        }}>
          <label htmlFor="wing-select" style={{ fontSize: 13, display: 'block', marginBottom: 8, color: 'var(--color-chalk)', fontWeight: '500' }}>
            Select Preferred Wing:
          </label>
          <select
            id="wing-select"
            style={{ 
              width: '100%', 
              marginBottom: 16, 
              padding: 10, 
              borderRadius: 8, 
              background: 'var(--color-carbon)', 
              color: 'var(--color-chalk)', 
              border: '1px solid var(--color-graphite)', 
              fontSize: 13 
            }}
            value={selectedWing}
            onChange={(e) => setSelectedWing(e.target.value)}
            disabled={loading}
          >
            <option value="" style={{ color: 'var(--color-ash)' }}>-- Choose a Wing --</option>
            {wings.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          <button
            style={{
              width: '100%',
              padding: '12px 16px',
              background: '#f47a20',
              border: 'none',
              borderRadius: 8,
              color: '#ffffff',
              fontWeight: 'bold',
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              opacity: (!selectedWing || loading) ? 0.6 : 1
            }}
            onClick={handleSubmit}
            disabled={!selectedWing || loading}
          >
            {loading ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      ) : (
        <div style={{ 
          background: 'var(--color-carbon)',
          border: '1px solid var(--color-graphite)',
          borderRadius: 16,
          padding: '24px 20px',
          width: '100%',
          maxWidth: '440px',
          margin: '0 auto',
          textAlign: 'center',
          color: 'var(--color-chalk)',
          fontSize: 14,
          lineHeight: '1.6'
        }}>
          {statusText}
        </div>
      )}
      <style>{`
        @keyframes spin-pending {
          to { stroke-dashoffset: -60; }
        }
        .pending-svg circle {
          transform-origin: center;
          animation: spin-pending 2s linear infinite;
        }
      `}</style>
    </div>
  )
}

function BoothAgentSetupMsg({ wtlCode, epicNo, isLatest }) {
  const [districtsData, setDistrictsData] = useState(null)
  const [district, setDistrict] = useState('')
  const [assembly, setAssembly] = useState(null)
  const [booth, setBooth] = useState('')
  const [step, setStep] = useState('district') // 'district' | 'assembly' | 'booth' | 'submitted' | 'error' | 'already_submitted'
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [existingRequest, setExistingRequest] = useState(null)

  useEffect(() => {
    if (!wtlCode) {
      setChecking(false)
      return
    }
    chat.getRequestStatus(wtlCode)
      .then(res => {
        if (res.success && res.boothAgent) {
          setExistingRequest(res.boothAgent)
          setStep('already_submitted')
        }
      })
      .catch(err => {
        console.error('Error fetching request status:', err)
      })
      .finally(() => {
        setChecking(false)
      })
  }, [wtlCode])

  useEffect(() => {
    if (step === 'already_submitted') return
    chat.getDistrictsData()
      .then(res => {
        if (res.success && res.data) {
          setDistrictsData(res.data)
        } else {
          setErrorMsg('Failed to load district data.')
          setStep('error')
        }
      })
      .catch(err => {
        setErrorMsg('Failed to load district data: ' + (err.message || ''))
        setStep('error')
      })
  }, [step])

  const handleDistrictSubmit = () => {
    if (district) setStep('assembly')
  }

  const handleAssemblySubmit = () => {
    if (assembly) setStep('booth')
  }

  const handleBoothSubmit = async () => {
    if (!booth) return
    setLoading(true)
    try {
      const res = await chat.requestBoothAgent(wtlCode, epicNo, booth, assembly.name, district)
      setStep('submitted')
    } catch (err) {
      setErrorMsg(err.message || 'Failed to submit booth agent request.')
      setStep('error')
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <div style={{ width: 32, height: 32, border: '3px solid rgba(46, 204, 113, 0.15)', borderTopColor: 'var(--color-signal-mint)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <div style={{ fontSize: 13, color: 'var(--color-ash)', marginTop: 12 }}>Checking status...</div>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#b45309' }}>
        <i className="bi bi-exclamation-triangle" style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
        {errorMsg}
      </div>
    )
  }

  if (step !== 'already_submitted' && !districtsData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <div style={{ width: 32, height: 32, border: '3px solid rgba(46, 204, 113, 0.15)', borderTopColor: 'var(--color-signal-mint)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <div style={{ fontSize: 13, color: 'var(--color-ash)', marginTop: 12 }}>Loading districts...</div>
      </div>
    )
  }

  const districts = districtsData ? Object.keys(districtsData) : []
  const assemblies = (district && districtsData) ? districtsData[district] : []
  const maxBooths = assembly ? assembly.booths : 0
  const booths = Array.from({ length: maxBooths }, (_, i) => i + 1)

  return (
    <div style={{ 
      width: '100%', 
      maxWidth: '600px',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 24
    }}>
      {/* Role Header Description */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: 'rgba(255, 153, 51, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px auto'
        }}>
          <i className="bi bi-building-fill-check" style={{ fontSize: 36, color: '#FF9933' }} />
        </div>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-chalk)', marginBottom: 8 }}>BJP Booth Agent</h3>
        <p style={{ fontSize: 13, color: 'var(--color-ash)', lineHeight: '1.6', margin: '0 auto', maxWidth: '480px' }}>
          As a BJP Booth Agent, you are the crucial guardian of our democratic process at the polling booth level. You will be responsible for booth management, voter facilitation, and ensuring fair elections in your local part.
        </p>
      </div>

      {step === 'already_submitted' && existingRequest && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          {/* Custom SVG Pending / Success Spinner */}
          <div style={{ position: 'relative', width: 80, height: 80 }}>
            {existingRequest.status === 'confirmed' ? (
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            ) : (
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#FF9933" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="pending-svg">
                <circle cx="12" cy="12" r="10" style={{ strokeDasharray: '60', strokeDashoffset: '20', animation: 'spin-pending 3s linear infinite' }} />
                <polyline points="12 6 12 12 15 15" />
              </svg>
            )}
          </div>

          <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: 'var(--color-chalk)' }}>
            Status: <span style={{ textTransform: 'capitalize', color: existingRequest.status === 'confirmed' ? '#2ecc71' : existingRequest.status === 'rejected' ? '#dc2626' : '#FF9933' }}>{existingRequest.status}</span>
          </div>

          {/* Grid fields */}
          <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <div style={{ 
              background: 'var(--color-carbon)', 
              border: '1px solid var(--color-graphite)',
              borderRadius: 12,
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-ash)' }}>
                <i className="bi bi-map" style={{ color: '#FF9933' }} />
                <span>District</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-chalk)' }}>{existingRequest.district}</span>
            </div>

            <div style={{ 
              background: 'var(--color-carbon)', 
              border: '1px solid var(--color-graphite)',
              borderRadius: 12,
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-ash)' }}>
                <i className="bi bi-geo-alt" style={{ color: '#FF9933' }} />
                <span>Assembly</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-chalk)' }}>{existingRequest.assembly}</span>
            </div>

            <div style={{ 
              background: 'var(--color-carbon)', 
              border: '1px solid var(--color-graphite)',
              borderRadius: 12,
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              gridColumn: 'span 2'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-ash)' }}>
                <i className="bi bi-pin-map" style={{ color: '#FF9933' }} />
                <span>Polling Booth Location</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-chalk)' }}>Booth Number {existingRequest.booth_no}</span>
            </div>
          </div>
        </div>
      )}

      {step !== 'already_submitted' && step !== 'submitted' && (
        <div style={{ 
          background: 'var(--color-carbon)',
          border: '1px solid var(--color-graphite)',
          borderRadius: 16,
          padding: '24px 20px',
          width: '100%',
          maxWidth: '440px',
          margin: '0 auto'
        }}>
          {step === 'district' && (
            <>
              <label htmlFor="district-select" style={{ fontSize: 13, display: 'block', marginBottom: 8, color: 'var(--color-chalk)', fontWeight: '500' }}>
                Select District:
              </label>
              <select
                id="district-select"
                style={{ width: '100%', marginBottom: 16, padding: 10, borderRadius: 8, background: 'var(--color-carbon)', color: 'var(--color-chalk)', border: '1px solid var(--color-graphite)', fontSize: 13 }}
                value={district}
                onChange={(e) => {
                  setDistrict(e.target.value)
                  setAssembly(null)
                  setBooth('')
                }}
              >
                <option value="" style={{ color: 'var(--color-ash)' }}>-- Choose a District --</option>
                {districts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <button
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: '#f47a20',
                  border: 'none',
                  borderRadius: 8,
                  color: '#ffffff',
                  fontWeight: 'bold',
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  opacity: !district ? 0.6 : 1
                }}
                onClick={handleDistrictSubmit}
                disabled={!district}
              >
                Next <i className="bi bi-chevron-right" />
              </button>
            </>
          )}

          {step === 'assembly' && (
            <>
              <div style={{ fontSize: 12, color: 'var(--color-ash)', marginBottom: 12 }}>
                District: <strong style={{ color: 'var(--color-chalk)' }}>{district}</strong>
              </div>
              <label htmlFor="assembly-select" style={{ fontSize: 13, display: 'block', marginBottom: 8, color: 'var(--color-chalk)', fontWeight: '500' }}>
                Choose Assembly:
              </label>
              <select
                id="assembly-select"
                style={{ width: '100%', marginBottom: 16, padding: 10, borderRadius: 8, background: 'var(--color-carbon)', color: 'var(--color-chalk)', border: '1px solid var(--color-graphite)', fontSize: 13 }}
                value={assembly ? JSON.stringify(assembly) : ''}
                onChange={(e) => {
                  setAssembly(e.target.value ? JSON.parse(e.target.value) : null)
                  setBooth('')
                }}
              >
                <option value="" style={{ color: 'var(--color-ash)' }}>-- Choose an Assembly --</option>
                {assemblies.map(a => <option key={a.no} value={JSON.stringify(a)}>{a.name} ({a.no})</option>)}
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    background: '#64748b',
                    border: 'none',
                    borderRadius: 8,
                    color: '#ffffff',
                    fontWeight: 'bold',
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}
                  onClick={() => setStep('district')}
                >
                  <i className="bi bi-chevron-left" /> Back
                </button>
                <button
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    background: '#f47a20',
                    border: 'none',
                    borderRadius: 8,
                    color: '#ffffff',
                    fontWeight: 'bold',
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    opacity: !assembly ? 0.6 : 1
                  }}
                  onClick={handleAssemblySubmit}
                  disabled={!assembly}
                >
                  Next <i className="bi bi-chevron-right" />
                </button>
              </div>
            </>
          )}

          {step === 'booth' && (
            <>
              <div style={{ fontSize: 12, color: 'var(--color-ash)', marginBottom: 12, lineHeight: '1.4' }}>
                District: <strong style={{ color: 'var(--color-chalk)' }}>{district}</strong><br/>
                Assembly: <strong style={{ color: 'var(--color-chalk)' }}>{assembly.name}</strong>
              </div>
              <label htmlFor="booth-select" style={{ fontSize: 13, display: 'block', marginBottom: 8, color: 'var(--color-chalk)', fontWeight: '500' }}>
                Select Polling Booth:
              </label>
              <select
                id="booth-select"
                style={{ width: '100%', marginBottom: 16, padding: 10, borderRadius: 8, background: 'var(--color-carbon)', color: 'var(--color-chalk)', border: '1px solid var(--color-graphite)', fontSize: 13 }}
                value={booth}
                onChange={(e) => setBooth(e.target.value)}
              >
                <option value="" style={{ color: 'var(--color-ash)' }}>-- Choose a Booth Number --</option>
                {booths.map(b => <option key={b} value={b}>Booth {b}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    background: '#64748b',
                    border: 'none',
                    borderRadius: 8,
                    color: '#ffffff',
                    fontWeight: 'bold',
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}
                  onClick={() => setStep('assembly')}
                  disabled={loading}
                >
                  <i className="bi bi-chevron-left" /> Back
                </button>
                <button
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    background: '#f47a20',
                    border: 'none',
                    borderRadius: 8,
                    color: '#ffffff',
                    fontWeight: 'bold',
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    opacity: (!booth || loading) ? 0.6 : 1
                  }}
                  onClick={handleBoothSubmit}
                  disabled={!booth || loading}
                >
                  {loading ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {step === 'submitted' && (
        <div style={{ 
          background: 'var(--color-carbon)',
          border: '1px solid var(--color-graphite)',
          borderRadius: 16,
          padding: '24px 20px',
          width: '100%',
          maxWidth: '440px',
          margin: '0 auto',
          textAlign: 'center',
          color: 'var(--color-chalk)',
          fontSize: 14,
          lineHeight: '1.6'
        }}>
          ✅ <strong>Your booth agent request has been submitted successfully!</strong><br/>
          <span style={{ fontSize: 12, opacity: 0.8 }}>Admin will review your request shortly.</span>
        </div>
      )}
      <style>{`
        @keyframes spin-pending {
          to { stroke-dashoffset: -60; }
        }
        .pending-svg circle {
          transform-origin: center;
          animation: spin-pending 2s linear infinite;
        }
      `}</style>
    </div>
  )
}

// ── Card Full View Modal Component ──────────────────────────
function CardModal({ cardData, onClose }) {
  const modalRef = useRef(null)
  const [downloading, setDownloading] = useState(false)
  const [cardWidth, setCardWidth] = useState(Math.min(window.innerWidth - 48, 520))

  useEffect(() => {
    const handleResize = () => setCardWidth(Math.min(window.innerWidth - 48, 520))
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--color-carbon)',
          border: '1px solid var(--color-graphite)',
          borderRadius: 24,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          maxWidth: '100%',
          position: 'relative',
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'transparent',
            border: 'none',
            color: 'var(--color-ash)',
            fontSize: 20,
            cursor: 'pointer',
            zIndex: 10,
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => e.target.style.color = 'var(--color-chalk)'}
          onMouseLeave={(e) => e.target.style.color = 'var(--color-ash)'}
          aria-label="Close"
        >
          <i className="bi bi-x-lg" />
        </button>

        <div style={{ alignSelf: 'flex-start', marginTop: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ash)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <i className="bi bi-credit-card-2-front" /> Digital Member Card
          </div>
        </div>

        <FlipCard3D
          ref={modalRef}
          cardData={cardData}
          width={cardWidth}
          showActions={false}
        />

        <div style={{ display: 'flex', gap: 12, width: '100%', justifyContent: 'center' }}>
          <button
            onClick={async () => {
              setDownloading(true)
              try {
                await modalRef.current?.download()
              } finally {
                setDownloading(false)
              }
            }}
            disabled={downloading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--color-signal-mint)',
              color: 'var(--color-abyss)',
              border: 'none',
              padding: '10px 24px',
              minHeight: 44,
              borderRadius: 16,
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {downloading ? (
              <span className="spinner-border spinner-border-sm" style={{ width: 12, height: 12, borderWidth: 2 }} />
            ) : (
              <i className="bi bi-download" />
            )}
            Download Card
          </button>
          <button
            onClick={onClose}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'transparent',
              border: '1px solid var(--color-graphite)',
              color: 'var(--color-chalk)',
              padding: '10px 20px',
              minHeight: 44,
              borderRadius: 16,
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

const SCHEMES = [
  {
    id: 1,
    category: 'Women & Child Welfare',
    title: 'Sukanya Samriddhi Yojana (SSY)',
    highlight: '8.2% INTEREST',
    link: 'https://www.nsiindia.gov.in/(S(wcm5mt55jsxbps55egzi1o45))/InternalPage.aspx?Id_Pk=89',
    overview: "This is a savings scheme by the Government of India designed to build a dedicated corpus for a girl child's higher education and marriage expenses.",
    tags: ['Girl Child Welfare', 'Tax-Free Savings', '8.2% Annually'],
    eligibility: 'Available for parents with girls under 10 years old. It features an attractive 8.2% tax-free interest rate and deduction benefits under Section 80C.',
    documents: [
      'Aadhaar & PAN (Parents)',
      'Child Birth Certificate',
      'Photo of Child & Parent'
    ],
    steps: [
      'Visit nearest Post Office or authorized commercial bank',
      'Collect Sukanya Samriddhi account opening form',
      'Fill form details with girl child and parent information',
      'Attach girl child birth certificate and parent KYC documents',
      'Make first deposit (minimum ₹250) to activate account'
    ]
  },
  {
    id: 2,
    category: 'Women & Child Welfare',
    title: 'Lakhpati Didi Scheme',
    highlight: '₹1 LAKH INCOME GOAL',
    link: 'https://lakhpatididi.gov.in/digital-ajeevika-register/',
    overview: 'A national livelihood program providing skill development, drone training, and enterprise credit support to rural women entrepreneurs.',
    tags: ['Women SHGs', '🛠️ Skill & Drone Training', 'Entrepreneurship Loan'],
    eligibility: 'Aims to enable rural Self-Help Group (SHG) women members to earn a sustainable household income of at least ₹1 Lakh per annum through entrepreneurship.',
    documents: [
      'Aadhaar & Ration Card',
      'SHG Membership Certificate',
      'Active Bank Passbook'
    ],
    steps: [
      'Join local women Self-Help Group (SHG) in your village',
      'Register for the Lakhpati Didi livelihood program',
      'Select and complete technical skill/drone training courses',
      'Create livelihood business project plan with group support',
      'Apply for interest-free/low-interest enterprise loan'
    ]
  },
  {
    id: 3,
    category: 'Women & Child Welfare',
    title: 'PM Matru Vandana Yojana (PMMVY)',
    highlight: '₹5,000 DIRECT CASH',
    link: 'https://wcd.delhi.gov.in/wcd/pradhan-mantri-matru-vandana-yojana-pmmvy',
    overview: 'A maternity benefit program that provides direct cash assistance to pregnant women to promote immunization and healthcare support.',
    tags: ['Maternal Nutrition', '👶 Child Immunization', '₹5,000 DBT Cash'],
    eligibility: 'Pregnant and lactating mothers receive a direct benefit transfer (DBT) of ₹5,00,000 in their bank account to compensate for wages and cover food.',
    documents: [
      'Aadhaar (Mother & Husband)',
      'Mother & Child Protection Card',
      'Aadhaar Seeded Bank Account'
    ],
    steps: [
      'Visit local Anganwadi Center or health sub-center',
      'Register first pregnancy or second girl child on portal',
      'Submit PMMVY application Form 1A with bank account copy',
      'Upload ANC health check-up records and child birth slip',
      'Receive cash benefit directly via Aadhaar-seeded DBT'
    ]
  },
  {
    id: 4,
    category: 'Education & Research',
    title: 'PM Vidyalaxmi Higher Education Loan',
    highlight: 'COLLATERAL-FREE',
    link: 'https://pmvidyalaxmi.co.in/',
    overview: 'A national portal offering meritorious students collateral-free and guarantor-free higher education loans for admission to designated Quality Higher Educational Institutions.',
    tags: ['Quality Education', 'Collateral-Free Loans', 'Interest Subvention'],
    eligibility: 'Enables access to education loans with zero assets required as collateral. Offers interest subvention of 3% for family incomes up to ₹8 Lakhs.',
    documents: [
      'Student & Parent Aadhaar',
      'College Admission Letter',
      'Fee Structure & Marksheets'
    ],
    steps: [
      'Register online on the official pmvidyalaxmi.gov.in portal',
      'Fill the Common Education Loan Application Form (CELAF)',
      'Select eligible bank loans matching your requirements',
      'Upload college admission letter, fee structure, and KYC',
      'Track application status online until loan is disbursed'
    ]
  },
  {
    id: 5,
    category: 'Education & Research',
    title: 'PM-YASASVI Scholarship Scheme',
    highlight: 'SCHOOL FEE GRANTS',
    link: 'https://www.dosje.gov.in/schemes-and-services/pm-yasasvi/',
    overview: 'A scholarship scheme under the Ministry of Social Justice and Empowerment for OBC, EBC, and DNT students studying in Top Class Schools.',
    tags: ['OBC/EBC Welfare', 'Merit Scholarships', 'Full Fee Support'],
    eligibility: 'Full fee coverage. Eligible students receive up to ₹75,000/year (Class 9-10) and up to ₹1,25,000/year (Class 11-12) via direct benefit transfer.',
    documents: [
      'Student Aadhaar & Caste Cert.',
      'Family Income Cert. (<₹2.5L)',
      'Marksheet of Previous Class'
    ],
    steps: [
      'Check eligibility criteria for OBC/EBC/DNT students',
      'Register online on National Scholarship Portal (NSP)',
      'Fill student profile and select YASASVI Scholarship',
      'Upload school marksheets, income certificate, and caste card',
      'Direct bank transfer of scholarship fund upon verification'
    ]
  },
  {
    id: 6,
    category: 'Education & Research',
    title: 'PM Research Fellowship (PMRF)',
    highlight: '₹80,000 / MONTH STIPEND',
    link: 'https://pmrf.in/',
    overview: 'A prestigious fellowship designed to support top scientific and technological PhD research talent at premium institutes.',
    tags: ['PhD Researchers', 'IIT/IISc/NIT Host', 'Contigency Fund'],
    eligibility: 'Stipends of ₹70,000 to ₹80,000/month, along with a research contingency grant of ₹2 Lakhs per year for 5 consecutive years.',
    documents: [
      'Academic Transcripts & Degrees',
      'Research Proposal Statement',
      'GATE/NET Score Report'
    ],
    steps: [
      'Enroll in PhD program at IITs, IISc, IISERs, or central universities',
      'Prepare detailed research project proposal with guide',
      'Apply online during the active PMRF admission cycle',
      'Submit academic references, publications, and transcripts',
      'Attend national committee interview for final selection'
    ]
  },
  {
    id: 7,
    category: 'Artisans & Small Business',
    title: 'PM Vishwakarma Scheme',
    highlight: '₹15,000 TOOLKIT GRANT',
    link: 'https://pmvishwakarma.gov.in/',
    overview: 'A scheme supporting traditional artisans and craftspeople who work with hand tools, aiming to preserve heritage and modernize their skills.',
    tags: ['🛠️ 18 Craft Trades', 'Toolkit Grants', 'Low Interest Loans'],
    eligibility: 'Covers 18 trades (carpenters, potters, blacksmiths, etc.). Provides ₹15,000 toolkit grants, training stipends, and collateral-free enterprise credit starting at 5% interest.',
    documents: [
      'Aadhaar Card (Linked Mobile)',
      'Bank Account Details',
      'Ration Card / Address Proof'
    ],
    steps: [
      'Visit local Common Service Center (CSC) with Aadhaar card',
      'Register trade details (carpenters, potters, weavers, etc.)',
      'Complete basic skill verification and training (5-7 days)',
      'Claim ₹15,000 toolkit digital e-voucher for modern tools',
      'Apply for first collateral-free loan up to ₹1,00,000'
    ]
  },
  {
    id: 8,
    category: 'Artisans & Small Business',
    title: 'Pradhan Mantri Mudra Yojana (PMMY)',
    highlight: '₹50,000 TO ₹20 LAKHS',
    link: 'https://www.mudra.org.in/Home/PMMYBankersKit',
    overview: 'A flagship loan scheme supporting non-farm, non-corporate micro and small enterprises to access collateral-free business capital.',
    tags: ['Micro Enterprises', 'Startups & Shops', 'No Asset Security'],
    eligibility: 'Provides business loans up to ₹20 Lakhs categorized into Shishu (up to ₹50k), Kishor (up to ₹5 Lakhs), and Tarun (up to ₹20 Lakhs) with no collateral needed.',
    documents: [
      'KYC Identity & Address Proof',
      'Business License / Udyam',
      'Last 6 Months Bank Statement'
    ],
    steps: [
      'Prepare business plan for Shishu, Kishor, or Tarun loan',
      'Visit nearest commercial bank, co-op bank, or NBFC',
      'Fill Pradhan Mantri Mudra Yojana application form',
      'Submit identity proof, address proof, and business license',
      'Get loan approved and disbursed without asset security'
    ]
  },
  {
    id: 9,
    category: 'Artisans & Small Business',
    title: 'PM SVANidhi Scheme',
    highlight: 'STREET VENDOR CREDIT',
    link: 'https://uatapi.udyamimitra.in/PMSVANidhi',
    overview: 'A special micro-credit scheme providing working capital loans to urban and semi-urban street vendors to resume livelihoods.',
    tags: ['Street Hawkers', 'Regular Repay Subsidy', 'Cash Back Rewards'],
    eligibility: 'First-time collateral-free working capital loan of ₹10,000. Successful repayment unlocks secondary loans of ₹20,000 and tertiary loans of ₹50,000.',
    documents: [
      'Aadhaar Card (Linked Mobile)',
      'Letter of Recommendation / Vendor ID',
      'Bank Account Details'
    ],
    steps: [
      'Ensure your name is in street vendor list (ULB survey)',
      'Apply online at pmsvanidhi.mohua.gov.in portal',
      'Submit Aadhaar card and Letter of Recommendation (LoR)',
      'Get details verified by local municipal corporation',
      'Receive first ₹10,000 working capital loan in bank'
    ]
  },
  {
    id: 10,
    category: 'Healthcare & Energy',
    title: 'Ayushman Bharat (PM-JAY) & CMCHIS',
    highlight: '₹5 LAKHS CASHLESS COVER',
    link: 'https://beneficiary.nha.gov.in/',
    overview: "A flagship health insurance program integrated with Tamil Nadu's Chief Minister's Comprehensive Health Insurance Scheme (CMCHIS), offering up to ₹5 Lakhs per family per year cashless treatment and extended to all senior citizens aged 70+.",
    tags: ['Cashless Hospitalization', '₹5 Lakhs Floater / Family', '👴 Senior Citizens 70+ Priority'],
    eligibility: 'Provides cashless hospital coverage of ₹5,00,000 per family per year on a floater basis for secondary and tertiary care at empanelled hospitals, with special priority cards issued to senior citizens aged 70+.',
    documents: [
      'Aadhaar Card',
      'Family Smart Ration Card',
      'Active Registered Mobile Number'
    ],
    steps: [
      'Check eligibility online at beneficiary.nha.gov.in portal',
      'Visit nearest Common Service Center (CSC) to print Ayushman card',
      'Locate empaneled government or private hospital for treatment',
      'Present Ayushman/CMCHIS card to Arogya Mitra at hospital',
      'Avail completely cashless treatment up to ₹5,00,000'
    ]
  },
  {
    id: 11,
    category: 'Healthcare & Energy',
    title: 'PM Surya Ghar: Muft Bijli Yojana',
    highlight: '300 UNITS FREE POWER',
    link: 'https://pmsuryaghar.gov.in/#/',
    overview: 'A national subsidy program to help households install rooftop solar systems, reducing electricity bills and supplying clean energy.',
    tags: ['☀️ Rooftop Solar Subsidy', '300 Free Power Units', '₹78,000 DBT Grant'],
    eligibility: 'Gives up to ₹78,000 cash subsidy directly into bank accounts for installations (up to 3kW). Excess power generated can be sold back to the grid.',
    documents: [
      'Aadhaar Card & Home Deed',
      'Electricity Bill (Latest)',
      'Bank Account Passbook Copy'
    ],
    steps: [
      'Register on pmsuryaghar.gov.in with electricity consumer number',
      'Submit feasibility application to local electricity board',
      'Choose certified vendor to install rooftop solar panels',
      'Install net meter and submit completion report to portal',
      'Receive subsidy directly in bank account within 30 days'
    ]
  },
  {
    id: 12,
    category: 'Agriculture & Farmers',
    title: 'PM Kisan Samman Nidhi (PM-KISAN)',
    highlight: '₹6,000 ANNUAL CASH SUPPORT',
    link: 'https://pmkisan.gov.in/',
    overview: 'An income support scheme providing direct financial assistance to all landholding farmer families across India to buy agricultural inputs.',
    tags: ['Landholding Farmers', 'Input Purchase Support', '₹6,000 DBT Income'],
    eligibility: 'Farmers receive an annual income support of ₹6,000 paid directly in 3 equal installments of ₹2,000 via Aadhaar-linked DBT transfers.',
    documents: [
      'Aadhaar & Mobile Number',
      'Land Holding Records (Patta/Chitta)',
      'Active Aadhaar Seeded Bank A/c'
    ],
    steps: [
      'Visit official pmkisan.gov.in portal for selfregistration',
      'Fill registration form with landholding details (Patta/Chitta)',
      'Enter active Aadhaar-seeded bank account credentials',
      'Get land ownership verified by local revenue officer (VAO)',
      'Receive ₹6,000 annual income support in three installments'
    ]
  },
  {
    id: 13,
    category: 'Agriculture & Farmers',
    title: 'PM Fasal Bima Yojana (PMFBY)',
    highlight: 'SUBSIDIZED PREMIUM COVER',
    link: 'https://pmfby.gov.in/',
    overview: 'A crop insurance scheme that protects farmers from financial losses due to natural disasters, crop diseases, pests, or localized bad weather.',
    tags: ['Agriculture Security', '🌧️ Natural Calamity Cover', '1.5% - 2% Premium Cap'],
    eligibility: 'Subsidized premium rates capped at 1.5% to 2% for food crops, oilseeds, and pulses. Provides comprehensive financial protection from sowing to post-harvest.',
    documents: [
      'Aadhaar Card',
      'Sowing/Land Holding Certificate',
      'Bank Passbook & Account Details'
    ],
    steps: [
      'Ensure crop is sown and notified for insurance coverage',
      'Visit pmfby.gov.in or nearest bank/CSC within deadline',
      'Submit land chitta/adangal and crop sowing certificate',
      'Pay heavily subsidized premium (1.5% to 2% for food crops)',
      'File claim within 72 h'
    ]
  }
];

function BrochurePanel({ onBack }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [expandedId, setExpandedId] = useState(null);

  const categories = [
    'All',
    'Women & Child Welfare',
    'Education & Research',
    'Artisans & Small Business',
    'Healthcare & Energy',
    'Agriculture & Farmers'
  ];

  const filteredSchemes = SCHEMES.filter(s => {
    const matchesCategory = activeCategory === 'All' || s.category === activeCategory;
    const matchesSearch = s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.overview.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="chatbot-container brochure-panel">
      <header className="brochure-header">
        <div className="brochure-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button 
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-ash)',
              cursor: 'pointer',
              padding: '4px 8px 4px 0',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-chalk)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-ash)'}
            aria-label="Back"
          >
            <i className="bi bi-chevron-left" />
          </button>
          <i className="bi bi-book-fill brochure-title-orange" />
          <span>BJP Brochure</span>
        </div>
      </header>

      <div className="brochure-content">
        <div className="brochure-controls">
          <div className="brochure-search-wrapper">
            <i className="bi bi-search brochure-search-icon" />
            <input 
              type="text" 
              className="brochure-search-input" 
              placeholder="Search Central Welfare Schemes..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="brochure-categories">
            {categories.map(cat => (
              <button 
                key={cat} 
                className={`category-pill ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => { setActiveCategory(cat); setExpandedId(null); }}
              >
                {cat === 'All' ? 'All Schemes' : cat}
              </button>
            ))}
          </div>
        </div>

        <div className="schemes-list">
          {filteredSchemes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-ash)' }}>
              <i className="bi bi-clipboard-x" style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
              No schemes found matching your search.
            </div>
          ) : (
            filteredSchemes.map((scheme, index) => {
              const isExpanded = expandedId === scheme.id;
              return (
                <div 
                  key={scheme.id} 
                  className="scheme-card"
                  onClick={() => setExpandedId(isExpanded ? null : scheme.id)}
                >
                  <div className="scheme-card-header">
                    <div>
                      <div className="scheme-meta-cat">{scheme.category}</div>
                      <h3 className="scheme-title">{index + 1}. {scheme.title}</h3>
                    </div>
                    {scheme.highlight && <span className="scheme-badge">{scheme.highlight}</span>}
                  </div>

                  <div className="scheme-tags-row">
                    {scheme.tags.map((t, idx) => (
                      <span key={idx} className="scheme-tag">{t}</span>
                    ))}
                  </div>

                  <p className="scheme-overview">{scheme.overview}</p>

                  <button className="scheme-toggle-btn" onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : scheme.id); }}>
                    <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`} />
                    <span>{isExpanded ? 'Hide Steps & Documents' : 'View Requirements & 5-Step Application'}</span>
                  </button>

                  {isExpanded && (
                    <div className="scheme-details-expanded" onClick={(e) => e.stopPropagation()}>
                      <div>
                        <div className="details-section-title">
                          <i className="bi bi-info-circle-fill" /> Eligibility & Benefits
                        </div>
                        <p className="details-text">{scheme.eligibility}</p>
                      </div>

                      <div>
                        <div className="details-section-title">
                          <i className="bi bi-file-earmark-check-fill" /> Required Documents
                        </div>
                        <div className="documents-list">
                          {scheme.documents.map((doc, idx) => (
                            <div key={idx} className="doc-item">
                              <i className="bi bi-check-circle-fill" />
                              <span>{doc}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="details-section-title">
                          <i className="bi bi-lightning-fill" /> How to Apply (5 Steps)
                        </div>
                        <div className="steps-list">
                          {scheme.steps.map((step, idx) => (
                            <div key={idx} className="step-item">
                              <span className="step-num">{idx + 1}</span>
                              <span className="details-text">{step}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {scheme.link && (
                        <div style={{ marginTop: 20 }}>
                          <a 
                            href={scheme.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 8,
                              backgroundColor: '#FF9933',
                              color: '#FFFFFF',
                              padding: '10px 20px',
                              borderRadius: 12,
                              fontWeight: 600,
                              textDecoration: 'none',
                              fontSize: 13,
                              transition: 'all 0.15s',
                              boxShadow: '0 4px 12px rgba(255, 153, 51, 0.2)'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#fa5d00';
                              e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#FF9933';
                              e.currentTarget.style.transform = 'none';
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <i className="bi bi-box-arrow-up-right" />
                            Apply Online (Click Here)
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function FullLetterPanel({ type, name, date, refCode, epicNo, onBack }) {
  const [selectedLang, setSelectedLang] = useState('ta')
  const [resolvedRefCode, setResolvedRefCode] = useState(refCode || '')

  useEffect(() => {
    if (refCode) {
      setResolvedRefCode(refCode)
    }
  }, [refCode])

  useEffect(() => {
    if (!resolvedRefCode && epicNo) {
      publicApi.getCardData(epicNo)
        .then((data) => {
          if (data && data.wtl_code) {
            setResolvedRefCode(data.wtl_code)
          }
        })
        .catch(() => {})
    }
  }, [resolvedRefCode, epicNo])

  const handleDownloadPDF = () => {
    const fileName = `${type === 'appreciation' ? 'Appreciation_Letter' : 'Welcome_Letter'}_${name}`
    triggerPDFDownload('full-letter-iframe', fileName);
  }

  const isAppreciation = type === 'appreciation';
  const letterUrl = isAppreciation
    ? `/Appreciation_letter.html?name=${encodeURIComponent(name)}&date=${encodeURIComponent(date)}&ref=${encodeURIComponent(resolvedRefCode || '')}&lang=${selectedLang}&hideControls=true&apiUrl=${encodeURIComponent(import.meta.env.VITE_API_URL || '')}&v=1.0.4`
    : `/Welcome_letter.html?name=${encodeURIComponent(name)}&date=${encodeURIComponent(date)}&ref=${encodeURIComponent(resolvedRefCode || '')}&lang=${selectedLang}&hideControls=true&apiUrl=${encodeURIComponent(import.meta.env.VITE_API_URL || '')}&v=1.0.4`;

  return (
    <div className="chatbot-container brochure-panel">
      <header className="brochure-header">
        <div className="brochure-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button 
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-ash)',
              cursor: 'pointer',
              padding: '4px 8px 4px 0',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-chalk)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-ash)'}
            aria-label="Back"
          >
            <i className="bi bi-chevron-left" />
          </button>
          <i className={`bi bi-${isAppreciation ? 'award-fill' : 'envelope-paper-fill'} brochure-title-orange`} />
          <span>{isAppreciation ? 'Letter of Appreciation' : 'Welcome Letter'}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* Tamil / Eng Toggle */}
          <div style={{ 
            display: 'flex', 
            background: 'var(--color-carbon)', 
            border: '1px solid var(--color-graphite)', 
            borderRadius: '20px', 
            padding: '2px',
            alignItems: 'center'
          }}>
            <button
              onClick={() => setSelectedLang('ta')}
              style={{
                background: selectedLang === 'ta' ? 'var(--color-signal-mint)' : 'transparent',
                color: selectedLang === 'ta' ? '#fff' : 'var(--color-ash)',
                border: 'none',
                borderRadius: '18px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              தமிழ்
            </button>
            <button
              onClick={() => setSelectedLang('en')}
              style={{
                background: selectedLang === 'en' ? 'var(--color-signal-mint)' : 'transparent',
                color: selectedLang === 'en' ? '#fff' : 'var(--color-ash)',
                border: 'none',
                borderRadius: '18px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              English
            </button>
          </div>

          <button 
            className="btn-brochure-back" 
            onClick={handleDownloadPDF}
            style={{ 
              borderColor: 'var(--color-signal-mint)', 
              color: 'var(--color-signal-mint)',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title={isAppreciation ? 'Download Appreciation Letter' : 'Download Welcome Letter'}
          >
            <i className="bi bi-download" style={{ fontSize: 16 }} />
          </button>
        </div>
      </header>
      <div style={{ flex: 1, background: '#f5f5f5', overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
        <iframe
          id="full-letter-iframe"
          key={selectedLang}
          src={letterUrl}
          style={{ width: '100%', height: selectedLang === 'ta' ? '2400px' : '100%', border: 'none', minHeight: '100%' }}
          title={isAppreciation ? 'Appreciation Letter' : 'Welcome Letter'}
          onLoad={(e) => {
            try {
              const iframe = e.target;
              const doc = iframe.contentDocument || iframe.contentWindow.document;
              const controls = doc.querySelector('.controls-container');
              if (controls) controls.style.display = 'none';

              const setH = () => {
                const scrollH = Math.max(
                  doc.documentElement.scrollHeight,
                  doc.body ? doc.body.scrollHeight : 0
                );
                if (scrollH > 200) {
                  iframe.style.height = scrollH + 'px';
                }
              };
              setH();
              setTimeout(setH, 800);  // retry after fonts load
              setTimeout(setH, 2000); // final retry
            } catch(err) {}
          }}
        />
      </div>
    </div>
  );
}

function FullBoothPanel({ epicNo, onBack }) {
  const [boothData, setBoothData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!epicNo) {
      setError('No booth data available. Please complete registration first.')
      setLoading(false)
      return
    }
    chat.getBooth(epicNo)
      .then((data) => {
        setBoothData(data)
      })
      .catch((err) => {
        setError(err.message || 'Unable to load booth information.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [epicNo])

  const getFieldIcon = (key) => {
    const k = key.toLowerCase();
    if (k.includes('assembly_name') || k.includes('assembly')) return 'geo-alt';
    if (k.includes('assembly_no') || k.includes('number')) return 'hash';
    if (k.includes('district')) return 'map';
    if (k.includes('part_no') || k.includes('part')) return 'pin-map';
    return 'info-circle';
  }

  const SKIP_KEYS = new Set(['success', 'polling_station'])
  const entries = boothData ? Object.entries(boothData).filter(([k, v]) => !SKIP_KEYS.has(k) && v !== null && v !== undefined && v !== '') : [];

  return (
    <div className="chatbot-container brochure-panel">
      <header className="brochure-header">
        <div className="brochure-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button 
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-ash)',
              cursor: 'pointer',
              padding: '4px 8px 4px 0',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-chalk)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-ash)'}
            aria-label="Back"
          >
            <i className="bi bi-chevron-left" />
          </button>
          <i className="bi bi-building brochure-title-orange" />
          <span>Booth Information</span>
        </div>
      </header>

      <div className="brochure-content">
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
            <div style={{ width: 32, height: 32, border: '3px solid rgba(46, 204, 113, 0.15)', borderTopColor: 'var(--color-signal-mint)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-ash)' }}>
            <i className="bi bi-exclamation-triangle" style={{ fontSize: 32, color: '#ff3b30', marginBottom: 12, display: 'block' }} />
            {error}
          </div>
        ) : (
          <div style={{ 
            width: '100%', 
            maxWidth: '640px',
            margin: '20px auto 0 auto',
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            gap: 24,
            background: 'transparent',
            border: 'none',
            borderRadius: 0,
            padding: '20px 0',
            boxShadow: 'none'
          }}>
            {/* Header Icon & Title */}
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <div style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'rgba(255, 153, 51, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px auto'
              }}>
                <i className="bi bi-building" style={{ fontSize: 36, color: '#FF9933' }} />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-chalk)', marginBottom: 4 }}>Polling Booth Details</h3>
              <p style={{ fontSize: 13, color: 'var(--color-ash)', margin: 0 }}>Registered election booth location and part details</p>
            </div>

            {/* Details Grid */}
            <div style={{ 
              width: '100%', 
              display: 'grid', 
              gridTemplateColumns: 'repeat(2, 1fr)', 
              gap: 12 
            }}>
              {entries.length > 0 ? entries.map(([k, v]) => (
                <div key={k} style={{ 
                  background: 'var(--color-carbon)', 
                  border: '1px solid var(--color-graphite)',
                  borderRadius: 12,
                  padding: '12px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-ash)' }}>
                    <i className={`bi bi-${getFieldIcon(k)}`} style={{ color: '#FF9933' }} />
                    <span style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-chalk)' }}>{String(v)}</span>
                </div>
              )) : (
                <div style={{ gridColumn: 'span 2', textAlign: 'center', padding: '24px', color: 'var(--color-ash)' }}>
                  No details found.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FullProfilePanel({ epicNo, mobile, referredCount, onBack }) {
  const [profileData, setProfileData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!epicNo) {
      setError('No profile data available.')
      setLoading(false)
      return
    }
    chat.profile(epicNo, mobile)
      .then((data) => {
        setProfileData(data)
      })
      .catch((err) => {
        setError(err.message || 'Unable to load profile.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [epicNo, mobile])

  return (
    <div className="chatbot-container brochure-panel">
      <header className="brochure-header">
        <div className="brochure-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button 
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-ash)',
              cursor: 'pointer',
              padding: '4px 8px 4px 0',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-chalk)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-ash)'}
            aria-label="Back"
          >
            <i className="bi bi-chevron-left" />
          </button>
          <i className="bi bi-person-circle brochure-title-orange" />
          <span>My Profile</span>
        </div>
      </header>

      <div className="brochure-content">
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
            <div style={{ width: 32, height: 32, border: '3px solid rgba(46, 204, 113, 0.15)', borderTopColor: 'var(--color-signal-mint)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-ash)' }}>
            <i className="bi bi-exclamation-triangle" style={{ fontSize: 32, color: '#ff3b30', marginBottom: 12, display: 'block' }} />
            {error}
          </div>
        ) : (
          <div style={{ 
            width: '100%', 
            maxWidth: '640px',
            margin: '20px auto 0 auto',
            display: 'flex', 
            flexDirection: 'row', 
            alignItems: 'center', 
            gap: 32,
            background: 'transparent',
            border: 'none',
            borderRadius: 0,
            padding: '20px 0',
            boxShadow: 'none',
            flexWrap: 'wrap'
          }}>
            {/* Left Column: Avatar & Name */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              width: '160px',
              margin: '0 auto',
              textAlign: 'center',
              flexShrink: 0
            }}>
              {/* Profile Photo */}
              <div style={{ position: 'relative' }}>
                {profileData.photo_url ? (
                  <img 
                    src={profileData.photo_url} 
                    alt={profileData.name} 
                    style={{ 
                      width: 96, 
                      height: 96, 
                      borderRadius: '50%', 
                      objectFit: 'cover', 
                      border: referredCount >= 5 ? '2.5px solid #FF9933' : '2px solid var(--color-graphite)',
                      boxShadow: referredCount >= 5 ? '0 0 16px rgba(255, 153, 51, 0.35)' : 'none'
                    }} 
                  />
                ) : (
                  <div style={{ 
                    width: 96, 
                    height: 96, 
                    borderRadius: '50%', 
                    background: '#252d27', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    border: '2px solid var(--color-graphite)' 
                  }}>
                    <i className="bi bi-person-fill" style={{ color: 'var(--color-ash)', fontSize: 44 }} />
                  </div>
                )}
              </div>

              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-chalk)', marginBottom: 4 }}>{profileData.name || 'Member'}</h3>
                <p style={{ fontSize: 12, color: 'var(--color-signal-mint)', fontWeight: 600, margin: 0 }}>
                  {referredCount >= 5 ? 'BJP Volunteer Agent' : 'BJP Registered Member'}
                </p>
              </div>
            </div>

            {/* Right Column: Grid Details */}
            <div style={{ 
              flex: 1, 
              minWidth: '280px', 
              display: 'grid', 
              gridTemplateColumns: 'repeat(2, 1fr)', 
              gap: 12 
            }}>
              <div style={{ 
                background: 'var(--color-carbon)', 
                border: '1px solid var(--color-graphite)',
                borderRadius: 12,
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-ash)' }}>
                  <i className="bi bi-hash" style={{ color: '#FF9933' }} />
                  <span>Member Code</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-chalk)', fontFamily: 'monospace' }}>{profileData.wtl_code || profileData.ptc_code || 'N/A'}</span>
              </div>

              <div style={{ 
                background: 'var(--color-carbon)', 
                border: '1px solid var(--color-graphite)',
                borderRadius: 12,
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-ash)' }}>
                  <i className="bi bi-card-text" style={{ color: '#FF9933' }} />
                  <span>EPIC Number</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-chalk)', fontFamily: 'monospace' }}>{profileData.epic_no || 'N/A'}</span>
              </div>

              <div style={{ 
                background: 'var(--color-carbon)', 
                border: '1px solid var(--color-graphite)',
                borderRadius: 12,
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-ash)' }}>
                  <i className="bi bi-phone" style={{ color: '#FF9933' }} />
                  <span>Mobile Number</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-chalk)', fontFamily: 'monospace' }}>{profileData.mobile || mobile || 'N/A'}</span>
              </div>

              <div style={{ 
                background: 'var(--color-carbon)', 
                border: '1px solid var(--color-graphite)',
                borderRadius: 12,
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-ash)' }}>
                  <i className="bi bi-geo" style={{ color: '#FF9933' }} />
                  <span>State</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-chalk)' }}>Tamil Nadu</span>
              </div>

              <div style={{ 
                background: 'var(--color-carbon)', 
                border: '1px solid var(--color-graphite)',
                borderRadius: 12,
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-ash)' }}>
                  <i className="bi bi-geo-alt" style={{ color: '#FF9933' }} />
                  <span>Assembly</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-chalk)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={profileData.assembly}>{profileData.assembly || 'N/A'}</span>
              </div>

              <div style={{ 
                background: 'var(--color-carbon)', 
                border: '1px solid var(--color-graphite)',
                borderRadius: 12,
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-ash)' }}>
                  <i className="bi bi-map" style={{ color: '#FF9933' }} />
                  <span>District</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-chalk)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={profileData.district}>{profileData.district || 'N/A'}</span>
              </div>

              <div style={{ 
                background: 'rgba(46,204,113,0.04)', 
                border: '1px solid rgba(46,204,113,0.1)',
                borderRadius: 12,
                padding: 14,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gridColumn: 'span 2'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="bi bi-people-fill" style={{ color: 'var(--color-signal-mint)', fontSize: 16 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-chalk)' }}>Total Referrals</span>
                </div>
                <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-signal-mint)' }}>{referredCount}</span>
              </div>
            </div>
          </div>
        )}
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function FullMyMembersPanel({ wtlCode, onBack }) {
  const [root, setRoot] = useState(null)
  const [tree, setTree] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedMember, setSelectedMember] = useState(null)

  useEffect(() => {
    if (!wtlCode) {
      setError('No referral code available.')
      setLoading(false)
      return
    }
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

  const directCount = tree.length
  const indirectCount = tree.reduce((acc, curr) => acc + (curr.referrals?.length || 0), 0)
  const totalCount = directCount + indirectCount

  const renderNode = (member, level) => {
    const isRoot = level === 1
    const nodeWidth = isRoot ? '200px' : '170px'
    
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
              <img src={member.photo_url} crossOrigin="anonymous" alt={member.name} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--color-graphite)' }} />
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
    <div className="chatbot-container brochure-panel">
      <header className="brochure-header">
        <div className="brochure-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button 
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-ash)',
              cursor: 'pointer',
              padding: '4px 8px 4px 0',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-chalk)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-ash)'}
            aria-label="Back"
          >
            <i className="bi bi-chevron-left" />
          </button>
          <i className="bi bi-people-fill brochure-title-orange" />
          <span>My Members</span>
        </div>
      </header>

      <div className="brochure-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
            <div style={{ width: 32, height: 32, border: '3px solid rgba(46, 204, 113, 0.15)', borderTopColor: 'var(--color-signal-mint)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-ash)' }}>
            <i className="bi bi-exclamation-triangle" style={{ fontSize: 32, color: '#ff3b30', marginBottom: 12, display: 'block' }} />
            {error}
          </div>
        ) : (
          <div style={{ width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Stats bar */}
            <div style={{ fontSize: 12, color: 'var(--color-signal-mint)', fontWeight: 600, borderBottom: '1px solid var(--color-graphite)', paddingBottom: 12 }}>
              Referral Tree Network — {directCount} Direct | {indirectCount} Indirect ({totalCount} Total)
            </div>

            {/* Tree Container (Left-to-Right layout) */}
            <div style={{ 
              background: 'var(--color-carbon)', 
              border: '1px solid var(--color-graphite)', 
              borderRadius: 20, 
              padding: '24px 16px', 
              display: 'flex', 
              alignItems: 'center',
              minHeight: '350px',
              overflowX: 'auto',
              overflowY: 'auto',
              gap: '32px',
              position: 'relative'
            }}>
              {/* LAYER 1: ROOT */}
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                {root && renderNode(root, 1)}
                {/* Horizontal connection line to L2 column */}
                {tree.length > 0 && (
                  <div style={{
                    width: '32px',
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
                  <p style={{ fontSize: 13, margin: '0 auto', color: 'var(--color-ash)' }}>
                    You haven't referred anyone yet. Share your custom BJP code to build your 3-layer support network!
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
                  
                  {/* Vertical connecting line spanning from first to last L2 node */}
                  {tree.length > 1 && (
                    <div style={{
                      position: 'absolute',
                      left: '-16px',
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
                          left: '-16px',
                          top: '50%',
                          width: '16px',
                          height: '2px',
                          background: 'var(--color-graphite)',
                          transform: 'translateY(-50%)',
                          zIndex: 1
                        }} />

                        {renderNode(parent, 2)}

                        {hasChildren && (
                          <div style={{
                            width: '24px',
                            height: '2px',
                            background: 'var(--color-graphite)',
                            flexShrink: 0
                          }} />
                        )}

                        {hasChildren && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                            position: 'relative'
                          }}>
                            {parent.referrals.length > 1 && (
                              <div style={{
                                position: 'absolute',
                                left: '0px',
                                right: '85px', // Stops at center of last node
                                height: '2px',
                                background: 'var(--color-graphite)',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                zIndex: 1
                              }} />
                            )}

                            {parent.referrals.map(child => (
                              <div key={child.wtl_code} style={{ display: 'flex', alignItems: 'center', gap: '16px', position: 'relative' }}>
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
        )}
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

            <h3 style={{ fontSize: 16, fontWeight: 'bold', color: 'var(--color-chalk)', marginBottom: 20 }}>Member Details</h3>

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
                width={300}
                autoFlip={false}
                showActions={false}
              />
            </div>

            <div style={{
              background: '#f9f8f6',
              border: '1px solid #E2E8F0',
              borderRadius: 16,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#555555' }}>Member Name</span>
                <span style={{ color: '#111111', fontWeight: 600 }}>{selectedMember.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#555555' }}>EPIC Number</span>
                <span style={{ color: '#111111', fontFamily: 'monospace', fontWeight: 600 }}>{selectedMember.epic_no || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#555555' }}>BJP Code</span>
                <span style={{ color: '#FF9933', fontFamily: 'monospace', fontWeight: 700 }}>{selectedMember.wtl_code}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#555555' }}>Assembly (Booth)</span>
                <span style={{ color: '#111111', fontWeight: 600 }}>
                  {selectedMember.assembly_name ? `${selectedMember.assembly_name} (Part ${selectedMember.part_no || '—'})` : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#555555' }}>District</span>
                <span style={{ color: '#111111', fontWeight: 600 }}>{selectedMember.district || '—'}</span>
              </div>
              {selectedMember.generated_at && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#555555' }}>Joined Date</span>
                  <span style={{ color: '#111111', fontWeight: 600 }}>{new Date(selectedMember.generated_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LocalBodyPanel({ onBack, localBodyInterest, handleLocalBodyInterestSubmit }) {
  const isLocked = localBodyInterest === 'interested' || localBodyInterest === 'not_interested';

  const handleClick = (value) => {
    if (isLocked) return;
    const confirmMsg = value === 'interested'
      ? 'Are you sure you want to submit "Interested"? This selection cannot be changed later.'
      : 'Are you sure you want to submit "Not Interested"? This selection cannot be changed later.';
    
    if (window.confirm(confirmMsg)) {
      handleLocalBodyInterestSubmit(value);
    }
  };

  return (
    <div className="chatbot-container brochure-panel">
      <header className="brochure-header">
        <div className="brochure-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button 
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-ash)',
              cursor: 'pointer',
              padding: '4px 8px 4px 0',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-chalk)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-ash)'}
            aria-label="Back"
          >
            <i className="bi bi-chevron-left" />
          </button>
          <i className="bi bi-check-square-fill brochure-title-orange" />
          <span>Local Body Election</span>
        </div>
      </header>

      <div className="brochure-scroll" style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{
          background: 'var(--color-carbon)',
          border: '1px solid var(--color-graphite)',
          borderRadius: 16,
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 16
        }}>
          <div style={{
            fontSize: 48,
            background: 'rgba(255, 153, 51, 0.1)',
            width: 80,
            height: 80,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 8
          }}>
            🗳️
          </div>
          
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-chalk)' }}>
            Local Body Elections
          </h2>
          
          <p style={{ fontSize: 13, lineHeight: '1.6', color: 'var(--color-ash)', maxWidth: 400 }}>
            BJP Tamil Nadu is preparing a database of active members who are interested in contesting, organizing, or coordinating local initiatives for the upcoming local body elections.
          </p>

          <div style={{
            width: '100%',
            height: '1px',
            background: 'var(--color-graphite)',
            margin: '8px 0'
          }} />

          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-chalk)' }}>
            Are you interested in participating or contesting in the upcoming Local Body Elections?
          </p>

          <div style={{ display: 'flex', gap: 16, width: '100%', marginTop: 8, justifyContent: 'center' }}>
            <button
              onClick={() => handleClick('interested')}
              disabled={isLocked}
              style={{
                padding: '12px 24px',
                borderRadius: 10,
                border: 'none',
                fontWeight: 600,
                cursor: isLocked ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: localBodyInterest === 'interested' ? '#2ecc71' : 'var(--color-graphite)',
                color: localBodyInterest === 'interested' ? '#FFF' : 'var(--color-ash)',
                opacity: isLocked && localBodyInterest !== 'interested' ? 0.4 : 1,
                transition: 'all 0.2s'
              }}
            >
              {localBodyInterest === 'interested' ? (
                <>
                  <i className="bi bi-check-circle-fill" style={{ fontSize: 16 }} />
                  Interested
                </>
              ) : (
                'Interested'
              )}
            </button>
            <button
              onClick={() => handleClick('not_interested')}
              disabled={isLocked}
              style={{
                padding: '12px 24px',
                borderRadius: 10,
                border: 'none',
                fontWeight: 600,
                cursor: isLocked ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: localBodyInterest === 'not_interested' ? '#e74c3c' : 'var(--color-graphite)',
                color: localBodyInterest === 'not_interested' ? '#FFF' : 'var(--color-ash)',
                opacity: isLocked && localBodyInterest !== 'not_interested' ? 0.4 : 1,
                transition: 'all 0.2s'
              }}
            >
              {localBodyInterest === 'not_interested' ? (
                <>
                  <i className="bi bi-x-circle-fill" style={{ fontSize: 16 }} />
                  Not Interested
                </>
              ) : (
                'Not Interested'
              )}
            </button>
          </div>

          {localBodyInterest && (
            <div style={{
              marginTop: 16,
              padding: '12px 16px',
              borderRadius: 8,
              background: 'rgba(255, 153, 51, 0.05)',
              border: '1px solid rgba(255, 153, 51, 0.15)',
              color: '#FF9933',
              fontSize: 13,
              fontWeight: 500,
              maxWidth: 400,
              lineHeight: '1.5'
            }}>
              {localBodyInterest === 'interested' 
                ? '🎉 Your interest has been submitted! Our election coordinators will reach out to you.'
                : 'Thank you for letting us know. You can change your selection at any time.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FullCardPanel({ card, onBack }) {
  const c = card || {}
  const [fullCardData, setFullCardData] = useState(null)
  const cardRef3D = useRef(null)
  const [cardWidth, setCardWidth] = useState(Math.min(540, window.innerWidth - 48))

  useEffect(() => {
    const handleResize = () => {
      setCardWidth(Math.min(540, window.innerWidth - 48))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const hasName = c.name || c.voter_name || c.VOTER_NAME;
    const hasAssembly = c.assembly_name || c.assembly || c.ASSEMBLY_NAME;
    if (hasName && hasAssembly) {
      setFullCardData(c)
    } else if (c.epic_no) {
      publicApi.getCardData(c.wtl_code || c.epic_no)
        .then((data) => setFullCardData(data))
        .catch(() => setFullCardData(c))
    }
  }, [c])

  return (
    <div className="chatbot-container brochure-panel">
      <header className="brochure-header">
        <div className="brochure-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button 
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-ash)',
              cursor: 'pointer',
              padding: '4px 8px 4px 0',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-chalk)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-ash)'}
            aria-label="Back"
          >
            <i className="bi bi-chevron-left" />
          </button>
          <i className="bi bi-credit-card-2-front brochure-title-orange" />
          <span>My Member Card</span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button 
            className="btn-brochure-back" 
            onClick={() => cardRef3D.current?.download()}
            style={{ 
              borderColor: 'var(--color-signal-mint)', 
              color: 'var(--color-signal-mint)',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Download ID Card"
          >
            <i className="bi bi-download" style={{ fontSize: 16 }} />
          </button>
        </div>
      </header>

      <div className="brochure-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '40px 20px', minHeight: 400 }}>
        {fullCardData ? (
          <>
            <FlipCard3D
              ref={cardRef3D}
              cardData={fullCardData}
              backUrl={c.back_url || fullCardData.back_url}
              width={cardWidth}
              autoFlip={false}
              showActions={false}
            />
            <div style={{ color: 'var(--color-ash)', fontSize: 13, textAlign: 'center', maxWidth: 360, marginTop: 12 }}>
              <i className="bi bi-info-circle-fill" style={{ color: '#FF9933', marginRight: 6 }} />
              Hover or click on the card to flip it and view the backside voter details.
            </div>
          </>
        ) : (
          <div style={{ width: 32, height: 32, border: '3px solid rgba(46, 204, 113, 0.15)', borderTopColor: 'var(--color-signal-mint)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        )}
      </div>
    </div>
  );
}

function FullFormPanel({ title, icon, onBack, children }) {
  return (
    <div className="chatbot-container brochure-panel">
      <header className="brochure-header">
        <div className="brochure-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button 
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-ash)',
              cursor: 'pointer',
              padding: '4px 8px 4px 0',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-chalk)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-ash)'}
            aria-label="Back"
          >
            <i className="bi bi-chevron-left" />
          </button>
          <i className={`bi bi-${icon} brochure-title-orange`} />
          <span>{title}</span>
        </div>
      </header>

      <div className="brochure-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '20px', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

function BestPerformersPanel({ onBack }) {
  const [performers, setPerformers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);

  useEffect(() => {
    chat.getBestPerformers()
      .then((data) => {
        setPerformers(data.performers || []);
      })
      .catch((err) => {
        setError(err.message || 'Unable to load leaderboard.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <div className="chatbot-container brochure-panel">
      <header className="brochure-header">
        <div className="brochure-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button 
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-ash)',
              cursor: 'pointer',
              padding: '4px 8px 4px 0',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-chalk)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-ash)'}
            aria-label="Back"
          >
            <i className="bi bi-chevron-left" />
          </button>
          <i className="bi bi-trophy-fill brochure-title-orange" />
          <span>Best Performers</span>
        </div>
      </header>

      <div className="brochure-content">
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
            <div style={{ width: 32, height: 32, border: '3px solid rgba(46, 204, 113, 0.15)', borderTopColor: 'var(--color-signal-mint)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-ash)' }}>
            <i className="bi bi-exclamation-triangle" style={{ fontSize: 32, color: '#ff3b30', marginBottom: 12, display: 'block' }} />
            {error}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-chalk)', marginBottom: 6 }}>Referral Champions 👑</h2>
              <p style={{ fontSize: 13, color: 'var(--color-ash)', maxWidth: 440, margin: '0 auto' }}>
                Leading volunteers who are driving local outreach and expanding our digital footprint across Tamil Nadu.
              </p>
            </div>

            {performers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-ash)' }}>
                <i className="bi bi-people-fill" style={{ fontSize: 40, color: 'var(--color-graphite)', marginBottom: 12, display: 'block' }} />
                <p>No referrals recorded yet. Be the first performer!</p>
              </div>
            ) : (
              performers.map((p, index) => {
                const rank = index + 1;
                
                const rankStyles = {
                  1: { border: '2px solid #FF9933', badge: '#FF9933', emoji: '👑' },
                  2: { border: '1px solid #c0c0c0', badge: '#c0c0c0', emoji: '🥈' },
                  3: { border: '1px solid #cd7f32', badge: '#cd7f32', emoji: '🥉' },
                  4: { border: '1px solid var(--color-graphite)', badge: 'var(--color-ash)', emoji: '' },
                  5: { border: '1px solid var(--color-graphite)', badge: 'var(--color-ash)', emoji: '' }
                };

                const style = rankStyles[rank] || rankStyles[5];

                return (
                  <div 
                    key={p.wtl_code}
                    onClick={() => setSelectedMember(p)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      padding: '12px 18px',
                      background: 'var(--color-carbon)',
                      border: style.border,
                      borderRadius: '16px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      border: `1.5px solid ${style.badge}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 'bold',
                      color: style.badge,
                      flexShrink: 0
                    }}>
                      {rank}
                    </div>

                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      {p.photo_url ? (
                        <img src={p.photo_url} crossOrigin="anonymous" alt={p.name} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid var(--color-graphite)' }} />
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#252d27', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--color-graphite)' }}>
                          <i className="bi bi-person-fill" style={{ color: 'var(--color-ash)', fontSize: 18 }} />
                        </div>
                      )}
                      {style.emoji && (
                        <span style={{ position: 'absolute', top: -6, right: -6, fontSize: 12 }}>{style.emoji}</span>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <span style={{ fontSize: 14, fontWeight: 'bold', color: 'var(--color-chalk)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-ash)', fontFamily: 'monospace' }}>BJP Code: <span style={{ color: 'var(--color-signal-mint)', fontWeight: 600 }}>{p.wtl_code}</span></span>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 'bold', color: 'var(--color-signal-mint)' }}>{p.referrals || p.referred_count || 0}</div>
                      <div style={{ fontSize: 9, color: 'var(--color-ash)', textTransform: 'uppercase' }}>Invited</div>
                    </div>
                  </div>
                );
              })
            )}

            {selectedMember && (
              <div 
                className="appointment-modal-overlay"
                onClick={() => setSelectedMember(null)}
              >
                <div 
                  className="appointment-modal-content"
                  onClick={(e) => e.stopPropagation()}
                  style={{ 
                    width: '580px', 
                    maxWidth: '95%',
                    padding: '24px 20px', 
                    display: 'flex', 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    gap: 20,
                    background: 'var(--color-carbon)',
                    border: '1px solid var(--color-graphite)',
                    borderRadius: 24,
                    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
                    position: 'relative',
                    flexWrap: 'wrap'
                  }}
                >
                  <button className="modal-close-btn" style={{ color: '#ff3b30' }} onClick={() => setSelectedMember(null)}>×</button>
                  
                  {/* Left Column: Avatar & Rank */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 12,
                    width: '140px',
                    margin: '0 auto',
                    textAlign: 'center',
                    flexShrink: 0
                  }}>
                    {/* Profile Photo */}
                    <div style={{ position: 'relative' }}>
                      {selectedMember.photo_url ? (
                        <img 
                          src={selectedMember.photo_url} 
                          alt={selectedMember.name} 
                          style={{ 
                            width: 80, 
                            height: 80, 
                            borderRadius: '50%', 
                            objectFit: 'cover', 
                            border: selectedMember.rank === 1 ? '2.5px solid #FF9933' : '2px solid var(--color-graphite)',
                            boxShadow: selectedMember.rank === 1 ? '0 0 16px rgba(255, 153, 51, 0.35)' : 'none'
                          }} 
                        />
                      ) : (
                        <div style={{ 
                          width: 80, 
                          height: 80, 
                          borderRadius: '50%', 
                          background: '#252d27', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          border: '2px solid var(--color-graphite)' 
                        }}>
                          <i className="bi bi-person-fill" style={{ color: 'var(--color-ash)', fontSize: 36 }} />
                        </div>
                      )}
                    </div>

                    {/* Rank Badge */}
                    <div style={{
                      background: selectedMember.rank === 1 ? 'linear-gradient(135deg, #FF9933 0%, #d47a1c 100%)' : 'rgba(255,255,255,0.06)',
                      border: selectedMember.rank === 1 ? 'none' : '1px solid var(--color-graphite)',
                      color: selectedMember.rank === 1 ? '#000' : 'var(--color-chalk)',
                      padding: '4px 10px',
                      borderRadius: '16px',
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap'
                    }}>
                      {selectedMember.rank === 1 ? '👑 Champion' : `Rank #${selectedMember.rank}`}
                    </div>

                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-chalk)', marginBottom: 2, wordBreak: 'break-all' }}>{selectedMember.name}</h3>
                      <p style={{ fontSize: 11, color: 'var(--color-signal-mint)', fontWeight: 600, margin: 0 }}>Volunteer Agent</p>
                    </div>
                  </div>

                  {/* Right Column: Details Grid */}
                  <div style={{ 
                    flex: 1, 
                    minWidth: '280px', 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(2, 1fr)', 
                    gap: 10 
                  }}>
                    <div style={{ 
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid rgba(255,255,255,0.04)',
                      borderRadius: 10,
                      padding: '8px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-ash)' }}>
                        <i className="bi bi-hash" style={{ color: '#FF9933' }} />
                        <span>Member Code</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-chalk)', fontFamily: 'monospace' }}>{selectedMember.wtl_code}</span>
                    </div>

                    <div style={{ 
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid rgba(255,255,255,0.04)',
                      borderRadius: 10,
                      padding: '8px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-ash)' }}>
                        <i className="bi bi-card-text" style={{ color: '#FF9933' }} />
                        <span>EPIC Number</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-chalk)', fontFamily: 'monospace' }}>{selectedMember.epic_no}</span>
                    </div>

                    <div style={{ 
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid rgba(255,255,255,0.04)',
                      borderRadius: 10,
                      padding: '8px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-ash)' }}>
                        <i className="bi bi-geo-alt" style={{ color: '#FF9933' }} />
                        <span>Assembly</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-chalk)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={selectedMember.assembly_name}>{selectedMember.assembly_name}</span>
                    </div>

                    <div style={{ 
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid rgba(255,255,255,0.04)',
                      borderRadius: 10,
                      padding: '8px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-ash)' }}>
                        <i className="bi bi-map" style={{ color: '#FF9933' }} />
                        <span>District</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-chalk)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={selectedMember.district}>{selectedMember.district}</span>
                    </div>

                    <div style={{ 
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid rgba(255,255,255,0.04)',
                      borderRadius: 10,
                      padding: '8px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-ash)' }}>
                        <i className="bi bi-pin-map" style={{ color: '#FF9933' }} />
                        <span>Part Number</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-chalk)', fontFamily: 'monospace' }}>{selectedMember.part_no}</span>
                    </div>

                    <div style={{ 
                      background: 'rgba(46,204,113,0.04)', 
                      border: '1px solid rgba(46,204,113,0.1)',
                      borderRadius: 10,
                      padding: '8px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="bi bi-people-fill" style={{ color: 'var(--color-signal-mint)', fontSize: 14 }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-chalk)' }}>Total Refs</span>
                      </div>
                      <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-signal-mint)' }}>{selectedMember.referrals}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ── Main ChatbotPage ────────────────────────────────────────
export default function ChatbotPage() {
  const navigate = useNavigate()
  useEffect(() => {
    console.log("BJP TN Member App v1.0.5 Loaded");

    window.handlePDFGenerated = (pdfBlob, filename) => {
      console.log('Parent received generated PDF blob:', filename);
      const file = new File([pdfBlob], filename, { type: 'application/pdf' });
      
      const uploadAndDownloadPDF = () => {
        const reader = new FileReader();
        reader.readAsDataURL(pdfBlob);
        reader.onloadend = () => {
          const base64data = reader.result.split(',')[1];
          const apiUrl = import.meta.env.VITE_API_URL || '';
          const uploadUrl = `${apiUrl}/api/verify/pdf/upload`;
          
          fetch(uploadUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              pdfData: base64data,
              filename: filename
            })
          })
          .then((res) => {
            if (!res.ok) throw new Error('Upload failed');
            return res.json();
          })
          .then((data) => {
            const downloadId = data.downloadId;
            const downloadUrl = `${apiUrl}/api/verify/pdf/download/${downloadId}?disposition=attachment`;
            
            // If we pre-opened a window, use it
            if (window.iosWin && !window.iosWin.closed) {
              window.iosWin.location.href = downloadUrl;
              window.iosWin = null;
            } else {
              // Otherwise navigate parent
              window.location.href = downloadUrl;
            }
          })
          .catch((err) => {
            console.error('Server upload failed, saving locally:', err);
            if (window.iosWin && !window.iosWin.closed) {
              try { window.iosWin.close(); } catch (e) {}
              window.iosWin = null;
            }
            // Fallback: programmatically click a blob link
            const blobUrl = URL.createObjectURL(pdfBlob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
          });
        };
      };

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        if (window.iosWin && !window.iosWin.closed) {
          try { window.iosWin.close(); } catch (e) {}
          window.iosWin = null;
        }
        navigator.share({
          files: [file],
          title: filename,
          text: 'Your Official BJP Tamil Nadu Letter'
        })
        .then(() => {
          console.log('PDF shared successfully');
        })
        .catch((err) => {
          console.warn('PDF share failed or canceled:', err);
          // If the user cancelled the share sheet (AbortError), don't trigger download fallback.
          // Otherwise, if it was a real failure, fall back to upload/download.
          if (err.name !== 'AbortError') {
            uploadAndDownloadPDF();
          }
        });
      } else {
        uploadAndDownloadPDF();
      }
    };

    return () => {
      delete window.handlePDFGenerated;
    };
  }, [])
  const [chatState, setChatState]   = useState(S.WELCOME)
  const [messages, setMessages]     = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping]     = useState(false)
  const [activeView, setActiveView] = useState('chat')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isFlipped, setIsFlipped]   = useState(false)
  const [cropSrc, setCropSrc]       = useState('')
  const [cropOpen, setCropOpen]     = useState(false)
  const [modalCard, setModalCard]   = useState(null)

  const [referredCount, setReferredCount] = useState(0)
  const [createdAt, setCreatedAt] = useState(null)
  const [appreciationEarnedAt, setAppreciationEarnedAt] = useState(null)
  const [hasAppointment, setHasAppointment] = useState(false)
  const [localBodyInterest, setLocalBodyInterest] = useState(null)
  const [meetingInterest, setMeetingInterest] = useState(null)
  const [volunteerStatus, setVolunteerStatus] = useState(null)
  const [boothAgentStatus, setBoothAgentStatus] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [bookingStep, setBookingStep] = useState(1) // 1: Congrats/Meeting request, 3: Meeting response thank you, 4: Local Body, 5: Local body thank you
  const [isBooking, setIsBooking] = useState(false)
  const [bookingError, setBookingError] = useState('')

  const soundPlayedRef = useRef({ localBody: false, president: false, volunteer: false, boothAgent: false })

  const playNotificationSound = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return
      const ctx = new AudioContext()
      const now = ctx.currentTime
      
      // Tone 1: C5
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(523.25, now)
      gain1.gain.setValueAtTime(0.12, now)
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start(now)
      osc1.stop(now + 0.25)

      // Tone 2: E5
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(659.25, now + 0.08)
      gain2.gain.setValueAtTime(0.12, now + 0.08)
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start(now + 0.08)
      osc2.stop(now + 0.35)
    } catch (err) {
      console.warn('Audio Context sound play failed:', err)
    }
  }

  const fetchMemberStatus = async (code) => {
    if (!code) return
    try {
      const res = await chat.getMemberStatus(code)
      if (res.success) {
        setReferredCount(res.referred_count || 0)
        setCreatedAt(res.created_at || null)
        setAppreciationEarnedAt(res.appreciation_earned_at || null)
        
        // Auto-unlock and download appreciation letter when reaching 5 referrals
        if ((res.referred_count || 0) >= 5 && !localStorage.getItem(`appreciation_letter_sent_${code}`)) {
          localStorage.setItem(`appreciation_letter_sent_${code}`, 'true');
          const todayDate = res.appreciation_earned_at 
            ? new Date(res.appreciation_earned_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
            : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
          const mName = cardRef.current?.name || profileRef.current?.name || 'Member';
          
          setTimeout(() => {
            addMsg('bot', 'text', { text: '🏆 *Congratulations!* You have successfully invited 5 members to join our party.' });
          }, 500);
          setTimeout(() => {
            addMsg('bot', 'text', { text: 'We are pleased to present you with this official Letter of Appreciation from the BJP State President:' });
          }, 1500);
          setTimeout(() => {
            addMsg('bot', 'appreciation_letter', { name: mName, date: todayDate, autoDownload: true });
          }, 2500);
        }

        setHasAppointment(res.has_appointment || false)
        setLocalBodyInterest(res.local_body_interest || null)
        setVolunteerStatus(res.volunteer_status || null)
        setBoothAgentStatus(res.booth_agent_status || null)
        
        let meetInt = null
        if (res.appointment) {
          meetInt = res.appointment.interest || null
        }
        setMeetingInterest(meetInt)

        // Check if any sound alert should trigger
        const isLocalBodyPending = res.local_body_interest === null
        const isPresidentPending = (res.referred_count || 0) >= 5 && (meetInt === null)
        const isVolunteerStatusAlert = (res.volunteer_status === 'confirmed' || res.volunteer_status === 'rejected') &&
          localStorage.getItem(`ack_vol_status_${code}`) !== res.volunteer_status
        const isBoothAgentStatusAlert = (res.booth_agent_status === 'confirmed' || res.booth_agent_status === 'rejected') &&
          localStorage.getItem(`ack_ba_status_${code}`) !== res.booth_agent_status

        if (isLocalBodyPending && !soundPlayedRef.current.localBody) {
          soundPlayedRef.current.localBody = true
          playNotificationSound()
        }
        if (isPresidentPending && !soundPlayedRef.current.president) {
          soundPlayedRef.current.president = true
          playNotificationSound()
        }
        if (isVolunteerStatusAlert && !soundPlayedRef.current.volunteer) {
          soundPlayedRef.current.volunteer = true
          playNotificationSound()
        }
        if (isBoothAgentStatusAlert && !soundPlayedRef.current.boothAgent) {
          soundPlayedRef.current.boothAgent = true
          playNotificationSound()
        }
      }
    } catch (err) {
      console.warn('Failed to fetch member status:', err)
    }
  }

  const handleBellClick = () => {
    setBookingError('')
    if (referredCount >= 5) {
      if (meetingInterest === null) {
        setBookingStep(1)
      } else {
        setBookingStep(3)
      }
      setShowModal(true)
    }
  }

  const handleSidebarOpen = () => {
    const sCode = cardRef.current?.wtl_code || cardRef.current?.ptc_code || profileRef.current?.wtl_code || profileRef.current?.ptc_code
    const volNotif = (volunteerStatus === 'confirmed' || volunteerStatus === 'rejected') &&
      localStorage.getItem(`ack_vol_status_${sCode}`) !== volunteerStatus
    const baNotif = (boothAgentStatus === 'confirmed' || boothAgentStatus === 'rejected') &&
      localStorage.getItem(`ack_ba_status_${sCode}`) !== boothAgentStatus
    if ((volNotif || baNotif) && !soundPlayedRef.current.sidebarOpen) {
      soundPlayedRef.current.sidebarOpen = true
      playNotificationSound()
    }
    setSidebarOpen(true)
  }

  const handleAcknowledgeStatus = (type, val) => {
    const code = cardRef.current?.wtl_code || cardRef.current?.ptc_code || profileRef.current?.wtl_code || profileRef.current?.ptc_code
    if (code) {
      if (type === 'volunteer') {
        localStorage.setItem(`ack_vol_status_${code}`, val)
      } else if (type === 'booth_agent') {
        localStorage.setItem(`ack_ba_status_${code}`, val)
      }
    }
    setShowModal(false)
  }

  const handleLocalBodyInterestSubmit = async (interestValue) => {
    const wtlCode = cardRef.current?.wtl_code || cardRef.current?.ptc_code || profileRef.current?.wtl_code || profileRef.current?.ptc_code
    if (!wtlCode) return
    setBookingError('')
    setIsBooking(true)
    try {
      const res = await chat.saveLocalBodyInterest(wtlCode, interestValue)
      setIsBooking(false)
      if (res.success) {
        setLocalBodyInterest(interestValue)
        setBookingStep(5)
      } else {
        setBookingError(res.message || 'Failed to record response.')
      }
    } catch (err) {
      setIsBooking(false)
      setBookingError(err.message || 'Network error.')
    }
  }

  const handleMeetingInterestSubmit = async (interestValue) => {
    const wtlCode = cardRef.current?.wtl_code || cardRef.current?.ptc_code || profileRef.current?.wtl_code || profileRef.current?.ptc_code
    if (!wtlCode) return
    setBookingError('')
    setIsBooking(true)
    try {
      const res = await chat.saveMeetingInterest(wtlCode, interestValue)
      setIsBooking(false)
      if (res.success) {
        setMeetingInterest(interestValue)
        setHasAppointment(interestValue === 'interested')
        setBookingStep(3)
      } else {
        setBookingError(res.message || 'Failed to record response.')
      }
    } catch (err) {
      setIsBooking(false)
      setBookingError(err.message || 'Network error.')
    }
  }

  useEffect(() => {
    const handler = (e) => setModalCard(e.detail)
    window.addEventListener('show-card-modal', handler)
    return () => window.removeEventListener('show-card-modal', handler)
  }, [])

  // Persistent refs (avoid stale closures)
  const initializedRef = useRef(false)
  const mobileRef   = useRef('')
  const epicRef     = useRef('')
  const cardRef     = useRef(null)
  const profileRef  = useRef(null)
  const voterRef    = useRef(null)
  const stateRef    = useRef(S.WELCOME)
  // Referral attribution — populated from URL params on mount
  const referralRef = useRef(getReferralParams())

  const messagesEndRef  = useRef(null)
  const fileInputRef    = useRef(null)
  const cameraInputRef  = useRef(null)

  // Keep stateRef synced
  useEffect(() => { stateRef.current = chatState }, [chatState])

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // ── Message helpers ───────────────────────────────────────
  const addMsg = useCallback((from, type, payload = {}) => {
    setMessages((prev) => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from, type, ...payload,
      ts: new Date(),
    }])
  }, [])

  const botSay = useCallback(async (text, delay = 500) => {
    setIsTyping(true)
    await sleep(delay)
    setIsTyping(false)
    addMsg('bot', 'text', { text })
  }, [addMsg])

  // ── Initialise ────────────────────────────────────────────
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const cache = getCache()
    if (cache?.card) {
      cardRef.current    = cache.card
      profileRef.current = cache.profile || {}
      epicRef.current    = cache.card.epic_no || ''
      // Note: mobile is NOT stored in localStorage for PII protection
      
      const { ref, rid } = getReferralParams()
      if (ref && rid) {
        addMsg('bot', 'text', { text: '⚠️ *Already you are a member!* Try to logout and rescan the QR.' })
      } else {
        addMsg('bot', 'text', { text: '👋 Welcome back to *BJP Tamil Nadu!*' })
      }

      const wtlCode = cache.card.wtl_code || cache.card.ptc_code
      if (wtlCode) {
        fetchMemberStatus(wtlCode)
      }
      setTimeout(() => {
        addMsg('bot', 'generated_card', { card: cache.card })
        setChatState(S.DONE)
      }, 300)
    } else {
      addMsg('bot', 'welcome_banner', {})
      setChatState(S.WELCOME)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Flow handlers ─────────────────────────────────────────
  const handleStart = async () => {
    addMsg('user', 'text', { text: 'Start' })
    setChatState(S.AWAIT_MOBILE)
    await botSay('📱 Please enter your 10-digit mobile number to get started.', 400)
  }

  const handleMobileSubmit = async () => {
    const mobile = inputValue.trim()
    if (!/^\d{10}$/.test(mobile)) {
      await botSay('❌ Please enter a valid 10-digit mobile number.', 300)
      return
    }
    mobileRef.current = mobile
    addMsg('user', 'text', { text: maskMobile(mobile) })
    setInputValue('')

    setIsTyping(true)
    try {
      const res = await chat.checkMobile(mobile)
      setIsTyping(false)
      if (res.has_card) {
        const card = {
          epic_no:       res.epic_no || '',
          voter_name:    res.voter_name || '',
          card_url:      res.card_url || '',
          back_url:      res.back_url || '',
          combined_url:  res.combined_url || res.card_url || '',
          photo_url:     res.photo_url || '',
          wtl_code:      res.wtl_code || '',
          referral_link: res.referral_link || '',
        }
        cardRef.current = card
        saveCache(card, {})
        if (res.referred_count !== undefined) {
          setReferredCount(res.referred_count)
        }
        if (card.wtl_code) {
          fetchMemberStatus(card.wtl_code)
        }
        await botSay('✅ You are already a registered member! Here is your Digital Member ID Card:', 300)
        addMsg('bot', 'generated_card', { card })
        setChatState(S.DONE)
        return
      }
    } catch (err) {
      console.warn('checkMobile failed, falling back to normal flow:', err)
      setIsTyping(false)
    }

    await botSay('✅ Mobile number saved! Now enter your EPIC Number (Voter ID).', 400)
    await botSay('📋 Format: 3 letters + 7 digits  e.g. ABC1234567', 200)
    setChatState(S.AWAIT_EPIC)
  }

  const handleEpicSubmit = async () => {
    const epic = inputValue.trim().toUpperCase()
    if (!/^[A-Z]{3}\d{7}$/.test(epic)) {
      await botSay('❌ Invalid format. Use 3 letters + 7 digits (e.g., ABC1234567).', 300)
      return
    }
    epicRef.current = epic
    addMsg('user', 'text', { text: epic })
    setInputValue('')
    setIsTyping(true)
    try {
      const res = await chat.validateEpic(epic, mobileRef.current)
      await sleep(200)
      setIsTyping(false)

      if (res.already_registered || res.card_url) {
        const card = {
          epic_no:     res.epic_no     || epic,
          voter_name:  res.voter_name  || '',
          card_url:    res.card_url    || '',
          back_url:    res.back_url    || '',
          combined_url: res.combined_url || '',
          photo_url:   res.photo_url   || '',
          wtl_code:    res.wtl_code    || res.ptc_code    || '',
          referral_link: res.referral_link || '',
        }
        cardRef.current = card
        saveCache(card, {})
        if (card.wtl_code) {
          fetchMemberStatus(card.wtl_code)
        }
        await botSay('✅ You are already a registered member! Here is your Digital Member ID Card:', 300)
        addMsg('bot', 'generated_card', { card })
        setChatState(S.DONE)
        return
      }

      const voter = res.voter || res.data || res
      if (!voter || (!voter.name && !voter.Name && !voter.voter_name)) {
        throw new Error('Voter data not found in response')
      }
      voterRef.current = voter
      await botSay('✅ Voter found! Please confirm your details:', 200)
      addMsg('bot', 'voter_card', { voter })
      setChatState(S.CONFIRM)
    } catch (err) {
      setIsTyping(false)
      // API returns 409 with already_registered — axios wraps it as error
      const data = err
      if (data?.already_registered || data?.card_url) {
        const card = {
          epic_no:     data.epic_no     || epic,
          voter_name:  data.voter_name  || '',
          card_url:    data.card_url    || '',
          back_url:    data.back_url    || '',
          combined_url: data.combined_url || '',
          photo_url:   data.photo_url   || '',
          wtl_code:    data.wtl_code    || data.ptc_code    || '',
          referral_link: data.referral_link || '',
        }
        cardRef.current = card
        saveCache(card, {})
        await botSay('✅ You are already a registered member! Here is your Digital Member ID Card:', 300)
        addMsg('bot', 'generated_card', { card })
        setChatState(S.DONE)
        return
      }
      await botSay(`❌ ${err.message || 'EPIC not found. Please check and try again.'}`, 200)
    }
  }

  const handleConfirm = async () => {
    addMsg('user', 'text', { text: '✓ Confirmed' })
    await botSay('📸 Please upload your recent passport-size photo to generate your card.', 400)
    setChatState(S.AWAIT_PHOTO)
  }

  const handleRetry = async () => {
    addMsg('user', 'text', { text: '↩ Try Again' })
    epicRef.current = ''
    voterRef.current = null
    await botSay('📋 Please enter your EPIC Number again.', 300)
    setChatState(S.AWAIT_EPIC)
  }

  const handleFileSelect = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      botSay('❌ Please select an image file (JPG, PNG, etc.).', 200)
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => { setCropSrc(e.target.result); setCropOpen(true) }
    reader.readAsDataURL(file)
  }

  const handleCropComplete = async (blob) => {
    setCropOpen(false)
    setCropSrc('')
    addMsg('user', 'text', { text: '📸 Photo uploaded' })
    setChatState(S.GENERATING)
    await botSay('⏳ Generating your card… please wait a moment.', 400)

    try {
      const formData = new FormData()
      formData.append('epic_no', epicRef.current)
      formData.append('mobile', mobileRef.current)
      formData.append('photo', blob, 'photo.jpg')

      // Pass referral attribution if user came via a referral link
      const { ref, rid } = referralRef.current
      if (ref) formData.append('ref', ref)
      if (rid) formData.append('rid', rid)

      const res = await chat.generateCard(formData)

      const card = {
        card_url:      res.card_url,
        back_url:      res.back_url,
        combined_url:  res.combined_url,
        epic_no:       res.epic_no || epicRef.current,
        wtl_code:      res.wtl_code || res.ptc_code,
        referral_link: res.referral_link || '',
        name:          voterRef.current?.name || voterRef.current?.VOTER_NAME || res.voter_name,
        assembly_name: voterRef.current?.assembly_name || voterRef.current?.assembly || voterRef.current?.ASSEMBLY_NAME,
        district:      voterRef.current?.district || voterRef.current?.DISTRICT || voterRef.current?.DISTRICT_NAME,
        part_no:       voterRef.current?.part_no || voterRef.current?.PartNo || voterRef.current?.PART_NO,
        photo_url:     res.photo_url || voterRef.current?.photo_url,
      }
      cardRef.current = card
      saveCache(card, profileRef.current || {})
      if (card.wtl_code) {
        fetchMemberStatus(card.wtl_code)
      }

      // Clear referral storage since card is successfully generated under this referral
      try {
        localStorage.removeItem('wtl_referral')
      } catch {}

      await botSay('🎉 Your Digital Member ID Card is ready!', 200)
      addMsg('bot', 'generated_card', { card, isNew: true })

      // Send Welcome Letter PDF attachment
      await sleep(1000)
      await botSay(
        '✉️ *Welcome to BJP Tamil Nadu!*\nWe have prepared your official welcome letter. Click below to view, print, or save it as a PDF:',
        300
      )
      await sleep(400)
      const regDate = card.created_at || card.generated_at
        ? new Date(card.created_at || card.generated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      addMsg('bot', 'welcome_letter', { name: card.name, date: regDate, ref: card.wtl_code || card.ptc_code, autoDownload: true })

      if (card.referral_link) {
        await sleep(1200)
        addMsg('bot', 'referral_link', { link: card.referral_link })
      }

      setChatState(S.DONE)
    } catch (err) {
      setChatState(S.AWAIT_PHOTO)
      await botSay(`❌ ${err.message || 'Error generating card. Please try uploading your photo again.'}`, 200)
    }
  }

  const handleBoothNoSubmit = async () => {
    const boothNo = inputValue.trim()
    if (!boothNo) return
    const wtlCode = cardRef.current?.wtl_code || cardRef.current?.ptc_code || profileRef.current?.wtl_code || profileRef.current?.ptc_code
    addMsg('user', 'text', { text: `Booth No: ${boothNo}` })
    setInputValue('')
    setIsTyping(true)
    try {
      const res = await chat.requestBoothAgent(wtlCode, epicRef.current, boothNo)
      setIsTyping(false)
      await botSay(res.message || '✅ Booth Agent request submitted! Admin will review it shortly.', 200)
    } catch (err) {
      setIsTyping(false)
      await botSay(`ℹ️ ${err.message || 'Unable to submit request. Please try again.'}`, 200)
    }
    setChatState(S.DONE)
  }

  // ── Sidebar actions ───────────────────────────────────────
  const handleSidebarAction = async (action) => {
    setSidebarOpen(false)
    if (action === 'brochure') {
      setActiveView('brochure')
      return
    }
    if (action === 'profile') {
      setActiveView('profile')
      return
    }
    if (action === 'my_card') {
      setActiveView('my_card')
      return
    }
    if (action === 'welcome_letter') {
      setActiveView('welcome_letter')
      return
    }
    if (action === 'appreciation_letter') {
      setActiveView('appreciation_letter')
      return
    }
    if (action === 'best_performers') {
      setActiveView('best_performers')
      return
    }
    if (action === 'volunteer') {
      setActiveView('volunteer')
      return
    }
    if (action === 'booth_agent') {
      setActiveView('booth_agent')
      return
    }
    if (action === 'booth_info') {
      setActiveView('booth_info')
      return
    }
    if (action === 'local_body') {
      setActiveView('local_body')
      return
    }
    if (action === 'my_members') {
      setActiveView('my_members')
      return
    }
    setActiveView('chat')
    const wtlCode = cardRef.current?.wtl_code || cardRef.current?.ptc_code || profileRef.current?.wtl_code || profileRef.current?.ptc_code

    switch (action) {


      case 'referral': {
        if (!wtlCode) { await botSay('ℹ️ Referral link unavailable.', 200); return }
        // Use cached link from card if available — avoids a session-auth round-trip
        const cachedLink = cardRef.current?.referral_link
        if (cachedLink) {
          setActiveView('referral')
          break
        }
        setIsTyping(true)
        try {
          const res = await chat.getReferralLink(wtlCode)
          setIsTyping(false)
          const link = res.referral_link || res.link || res.url || ''
          // Cache it on the card ref for future sidebar clicks
          if (link && cardRef.current) cardRef.current.referral_link = link
          setActiveView('referral')
        } catch {
          setIsTyping(false)
          await botSay('❌ Unable to load referral link.', 200)
        }
        break
      }
      default: break
    }
  }

  const handleLogout = async () => {
    // 1. Clear all in-memory React state
    clearCache()                           // localStorage CACHE_KEY
    sessionStorage.clear()                 // any session-level cache
    mobileRef.current  = ''
    epicRef.current    = ''
    cardRef.current    = null
    profileRef.current = null
    voterRef.current   = null
    soundPlayedRef.current = { localBody: false, president: false }
    setSidebarOpen(false)
    setIsFlipped(false)
    setInputValue('')
    setMessages([])

    // 2. Destroy the backend session cookie (fire-and-forget)
    try { await chat.logout() } catch (_) {}

    // 3. Full page reload after a tiny delay — ensures a totally clean slate
    //    so no cached card / photo data bleeds into the next user's session
    setTimeout(() => window.location.reload(), 300)
  }

  // ── Input config ──────────────────────────────────────────
  const getInputCfg = () => {
    switch (chatState) {
      case S.AWAIT_MOBILE:
        return { type: 'tel', placeholder: 'Enter 10-digit mobile number', maxLength: 10, inputMode: 'numeric' }
      case S.AWAIT_EPIC:
        return { type: 'text', placeholder: 'EPIC Number (e.g. ABC1234567)', maxLength: 10 }
      case S.AWAIT_BOOTH_NO:
        return { type: 'text', placeholder: 'Enter your Booth Number', maxLength: 30 }
      default:
        return null
    }
  }

  const getIsSendDisabled = () => {
    if (isTyping) return true
    const val = inputValue.trim()
    if (chatState === S.AWAIT_MOBILE) return val.length !== 10
    if (chatState === S.AWAIT_EPIC) return val.length !== 10
    return !val
  }

  const handleInputChange = (e) => {
    let val = e.target.value
    if (chatState === S.AWAIT_EPIC) {
      val = val.toUpperCase().replace(/[^A-Z0-9]/g, '')
      const letters = val.slice(0, 3).replace(/[^A-Z]/g, '')
      const digits  = val.slice(3).replace(/[^0-9]/g, '').slice(0, 7)
      val = letters + digits
    } else if (chatState === S.AWAIT_MOBILE) {
      val = val.replace(/\D/g, '')
    }
    setInputValue(val)
  }

  const handleSubmit = async (e) => {
    e?.preventDefault()
    if (!inputValue.trim() || isTyping) return
    switch (chatState) {
      case S.AWAIT_MOBILE:   await handleMobileSubmit(); break
      case S.AWAIT_EPIC:     await handleEpicSubmit(); break
      case S.AWAIT_BOOTH_NO: await handleBoothNoSubmit(); break
      default: break
    }
  }

  // ── Render message content ────────────────────────────────
  const renderMsgContent = (msg) => {
    switch (msg.type) {
      case 'text': {
        // HTML-escape text before applying bold markdown to prevent XSS
        const escapeHtml = (s) => String(s || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
        const safeHtml = escapeHtml(msg.text || '').replace(/\*(.*?)\*/g, '<strong>$1</strong>')
        return <span dangerouslySetInnerHTML={{ __html: safeHtml }} />
      }
      case 'welcome_banner':
        return <WelcomeBannerMsg onStart={handleStart} />
      case 'voter_card': {
        const isLatest = messages[messages.length - 1]?.id === msg.id
        return (
          <VoterCardMsg
            voter={msg.voter}
            isLatest={isLatest}
            chatState={chatState}
            onConfirm={handleConfirm}
            onRetry={handleRetry}
            disabled={isTyping}
          />
        )
      }
      case 'generated_card':
        return <GeneratedCardMsg card={msg.card} isNew={msg.isNew || false} />
      case 'welcome_letter':
        return <WelcomeLetterMsg name={msg.name} date={msg.date} refCode={msg.ref || cardRef.current?.wtl_code || cardRef.current?.ptc_code || profileRef.current?.wtl_code || profileRef.current?.ptc_code} autoDownload={msg.autoDownload} />
      case 'appreciation_letter':
        return <AppreciationLetterMsg name={msg.name} date={msg.date} refCode={msg.ref || cardRef.current?.wtl_code || cardRef.current?.ptc_code || profileRef.current?.wtl_code || profileRef.current?.ptc_code} autoDownload={msg.autoDownload} />
      case 'profile_card':
        return (
          <div className="profile-card">
            {msg.profile?.photo_url && (
              <img src={msg.profile.photo_url} crossOrigin="anonymous" alt="Profile" className="profile-photo" />
            )}
            <div className="profile-details">
              <h4>{msg.profile?.name || 'Member'}</h4>
              <p>{[msg.profile?.assembly, msg.profile?.district].filter(Boolean).join(', ')}</p>
              {(msg.profile?.epic_no || epicRef.current) && <p>EPIC: {msg.profile?.epic_no || epicRef.current}</p>}
              {(msg.profile?.wtl_code || msg.profile?.ptc_code) && <p className="wtl">BJP: {msg.profile.wtl_code || msg.profile.ptc_code}</p>}
            </div>
          </div>
        )
      case 'booth_info': {
        const booth = msg.booth || {}
        const SKIP_KEYS = new Set(['success', 'polling_station'])
        const entries = Object.entries(booth).filter(([k, v]) => !SKIP_KEYS.has(k) && v !== null && v !== undefined && v !== '')
        return (
          <div className="info-card booth-card">
            <div className="info-card-header"><i className="bi bi-building" /> Booth Information</div>
            <div className="vdc-body">
              {entries.length > 0 ? entries.map(([k, v]) => (
                <div className="vdc-row" key={k}>
                  <span className="vdc-label">{k.replace(/_/g, ' ')}</span>
                  <span className="vdc-value">{String(v)}</span>
                </div>
              )) : <p style={{ padding: '10px 12px', fontSize: 12, color: '#8696a0' }}>No booth information available.</p>}
            </div>
          </div>
        )
      }
      case 'referral_link':
        return <ReferralLinkMsg link={msg.link || ''} />
      case 'members_list': {
        const members = msg.members || []
        return (
          <div className="members-card info-card">
            <div className="info-card-header"><i className="bi bi-people-fill" /> My Members ({members.length})</div>
            {members.length === 0 ? (
              <p className="members-empty">No members yet. Share your referral link!</p>
            ) : (
              <ul className="members-list">
                {members.slice(0, 15).map((m, i) => (
                  <li key={i}>
                    <span>{m.name || m.Name || m.voter_name || 'Member'}</span>
                    <span style={{ opacity: 0.6, fontSize: 11 }}>{m.epic_no || m.EpicNo || ''}</span>
                  </li>
                ))}
                {members.length > 15 && <li style={{ opacity: 0.5, fontStyle: 'italic' }}>+{members.length - 15} more…</li>}
              </ul>
            )}
          </div>
        )
      }
      case 'best_performers': {
        const performers = msg.performers || []
        return (
          <div className="members-card info-card best-performers-card">
            <div className="info-card-header">
              <i className="bi bi-trophy-fill text-warning me-2" /> Top 5 Referrers
            </div>
            {performers.length === 0 ? (
              <p className="members-empty">No referrals generated yet. Invite members to lead the board!</p>
            ) : (
              <ul className="members-list best-performers-list" style={{ listStyle: 'none', padding: 0 }}>
                {performers.map((p, i) => (
                  <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: i < performers.length - 1 ? '1px solid var(--border-dim)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className={`rank-badge rank-${p.rank}`} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        fontSize: 11,
                        fontWeight: 'bold',
                        background: p.rank === 1 ? '#ffd700' : p.rank === 2 ? '#c0c0c0' : p.rank === 3 ? '#cd7f32' : 'var(--admin-surface-raise)',
                        color: p.rank <= 3 ? '#000' : 'var(--text-secondary)'
                      }}>{p.rank}</span>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 13, fontWeight: '500' }}>{p.name}</span>
                        <span style={{ fontSize: 10, opacity: 0.6 }}>BJP Code: {p.wtl_code}</span>
                      </div>
                    </div>
                    <span className="badge-status badge-generated" style={{ fontSize: 12, fontWeight: 'bold' }}>
                      {p.referred_count} {p.referred_count === 1 ? 'referral' : 'referrals'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      }
      case 'select_wing': {
        const isLatest = messages[messages.length - 1]?.id === msg.id
        return (
          <SelectWingMsg
            wtlCode={msg.wtlCode}
            epicNo={msg.epicNo}
            isLatest={isLatest}
          />
        )
      }
      case 'booth_agent_flow': {
        const isLatest = messages[messages.length - 1]?.id === msg.id
        return (
          <BoothAgentSetupMsg
            wtlCode={msg.wtlCode}
            epicNo={msg.epicNo}
            isLatest={isLatest}
          />
        )
      }
      default:
        return <span>{msg.text || ''}</span>
    }
  }

  // ── Input area render ─────────────────────────────────────
  const inputCfg = getInputCfg()
  const isWide   = ['voter_card', 'generated_card', 'booth_info', 'referral_link', 'members_list', 'profile_card'].includes
  const isDone   = chatState === S.DONE

  const code = cardRef.current?.wtl_code || cardRef.current?.ptc_code || profileRef.current?.wtl_code || profileRef.current?.ptc_code
  const hasPendingNotification = 
    (referredCount >= 5 && meetingInterest === null)

  const hasVolunteerNotif = (volunteerStatus === 'confirmed' || volunteerStatus === 'rejected') &&
    localStorage.getItem(`ack_vol_status_${code}`) !== volunteerStatus
  const hasBoothAgentNotif = (boothAgentStatus === 'confirmed' || boothAgentStatus === 'rejected') &&
    localStorage.getItem(`ack_ba_status_${code}`) !== boothAgentStatus
  const hasSidebarNotification = hasVolunteerNotif || hasBoothAgentNotif

  // Cache-busting comment v1.0.5 to force new hash
  return (
    <div className="chatbot-app wtl-theme">
      {/* ── Main Layout ── */}
      <div className="main-content-layout single-layout">
        
        {/* Left Menu Panel (WhatsApp style) */}
        <div className="left-menu-panel">
          <div className="left-menu-header">
            <div className="left-menu-profile">
              <img src="/bjp_logo.svg" alt="BJP" onError={(e) => { e.target.style.display = 'none' }} />
              <div className="left-menu-profile-info">
                <div className="left-menu-brand">BJP TAMIL NADU</div>
                <div className="left-menu-status">
                  <span className="status-dot-green" /> Online
                </div>
              </div>
            </div>
            <div className="left-menu-header-actions" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {isDone && (
                <button
                  className={`chat-header-btn bell-alert-btn ${
                    hasPendingNotification ? 'pulsing-vibrate' : ''
                  } ${hasAppointment ? 'bell-booked-btn' : ''}`}
                  onClick={handleBellClick}
                  title={
                    hasAppointment 
                      ? 'Meeting Scheduled! Click to view details' 
                      : 'Milestone Achieved! Click to Schedule Meeting with President'
                  }
                  style={{ 
                    fontSize: 18, 
                    color: hasAppointment ? '#2ecc71' : '#D1B078', 
                    border: 'none', 
                    background: 'none', 
                    cursor: 'pointer' 
                  }}
                >
                  <i className="bi bi-bell-fill" />
                  {hasPendingNotification && <span className="bell-badge" />}
                </button>
              )}
              {isDone && (
                <button
                  className="chat-header-btn"
                  onClick={() => {
                    if (window.confirm('Logout and start over?')) handleLogout()
                  }}
                  title="Logout"
                  style={{ fontSize: 16 }}
                >
                  <i className="bi bi-box-arrow-right" />
                </button>
              )}
            </div>
          </div>



          <div className="left-chat-list">
            <div className="left-chat-item active">
              <div className="left-chat-avatar bot-avatar">
                <i className="bi bi-robot" />
              </div>
              <div className="left-chat-details">
                <div className="left-chat-name-row">
                  <span className="left-chat-name">BJP TN Member Bot</span>
                  <span className="left-chat-time">{fmtTime(new Date())}</span>
                </div>
                <div className="left-chat-msg">
                  {!isDone ? 'Register to generate your Member Card' : 'Registration completed successfully!'}
                </div>
              </div>
            </div>

            {[
              { icon: 'person-circle',       label: 'My Profile',       action: 'profile',     desc: 'View registration details' },
              { icon: 'credit-card-2-front', label: 'My Card',          action: 'my_card',      desc: 'View and download ID card' },
              { icon: 'envelope-paper-fill', label: 'My Welcome Letter', action: 'welcome_letter', desc: 'View and download welcome letter' },
              { icon: 'book-fill',           label: 'BJP Brochure',     action: 'brochure',     desc: 'Official Central Welfare Schemes Booklet' },
              { icon: 'award-fill',          label: 'My Appreciation Letter', action: 'appreciation_letter', desc: 'Earned at 5 successful referrals' },
              { icon: 'building',            label: 'Booth Info',        action: 'booth_info',   desc: 'Get your booth details' },
              { icon: 'link-45deg',          label: 'Referral Link',     action: 'referral',     desc: 'Share and invite others' },
              { icon: 'people-fill',         label: 'My Members',        action: 'my_members',   desc: 'Voters registered via your link' },
              { icon: 'trophy-fill',         label: 'Best Performers',   action: 'best_performers', desc: 'Top 5 referrers list' },
              { icon: 'hand-thumbs-up-fill', label: 'Be an Organizer',    action: 'volunteer',    desc: 'Apply to be a BJP Organizer' },
              { icon: 'building-fill-check', label: 'Be a Booth Agent',  action: 'booth_agent',  desc: 'Apply to be a Booth Agent' },
              { icon: 'check-square-fill',   label: 'Local Body Election', action: 'local_body',   desc: 'Participate in Local Body elections' },
            ].map((item) => {
              const isComingSoon = false
              const locked = !isDone || (item.action === 'appreciation_letter' && referredCount < 5)
              const itemHasNotif =
                (item.action === 'volunteer' && hasVolunteerNotif) ||
                (item.action === 'booth_agent' && hasBoothAgentNotif)
              const notifStatus =
                item.action === 'volunteer' ? volunteerStatus :
                item.action === 'booth_agent' ? boothAgentStatus : null
              return (
                <div
                  key={item.action}
                  className={`left-chat-item option-item ${locked ? 'locked' : ''}`}
                  role="button"
                  tabIndex={locked ? -1 : 0}
                  aria-disabled={locked}
                  onClick={() => !locked && handleSidebarAction(item.action)}
                  onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !locked) { e.preventDefault(); handleSidebarAction(item.action) } }}
                  title={isComingSoon ? 'Coming Soon' : (item.action === 'appreciation_letter' && referredCount < 5) ? 'Invite 5 members to unlock appreciation letter' : locked ? 'Complete registration to unlock' : item.desc}
                >
                  <div className="left-chat-avatar option-avatar">
                    <i className={`bi bi-${item.icon}`} />
                  </div>
                  <div className="left-chat-details">
                    <div className="left-chat-name-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span className="left-chat-name">{item.label}</span>
                        {isComingSoon && <span className="coming-soon-badge">Coming Soon</span>}
                        {itemHasNotif && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            background: notifStatus === 'confirmed' ? 'rgba(46,204,113,0.15)' : 'rgba(229,57,53,0.15)',
                            color: notifStatus === 'confirmed' ? '#2ecc71' : '#e53935',
                            border: `1px solid ${notifStatus === 'confirmed' ? '#2ecc71' : '#e53935'}`,
                            borderRadius: 20, padding: '1px 7px', fontSize: 10, fontWeight: 700
                          }}>
                            {notifStatus === 'confirmed'
                              ? <><i className="bi bi-check-circle-fill" /> Accepted</>
                              : <><i className="bi bi-x-circle-fill" /> Rejected</>}
                          </span>
                        )}
                      </div>
                      {locked && <i className="bi bi-lock-fill lock-icon" />}
                    </div>
                    <div className="left-chat-msg">{item.desc}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Chatbot Panel */}
        <div className="right-chat-panel">
          {activeView === 'brochure' ? (
            <BrochurePanel onBack={() => setActiveView('chat')} />
          ) : activeView === 'booth_info' ? (
            <FullBoothPanel 
              epicNo={epicRef.current || cardRef.current?.epic_no || profileRef.current?.epic_no} 
              onBack={() => setActiveView('chat')} 
            />
          ) : activeView === 'profile' ? (
            <FullProfilePanel 
              epicNo={epicRef.current || cardRef.current?.epic_no || profileRef.current?.epic_no} 
              mobile={mobileRef.current || cardRef.current?.mobile || profileRef.current?.mobile} 
              referredCount={referredCount} 
              onBack={() => setActiveView('chat')} 
            />
          ) : activeView === 'my_card' ? (
            <FullCardPanel card={cardRef.current} onBack={() => setActiveView('chat')} />
          ) : activeView === 'welcome_letter' ? (
            <FullLetterPanel 
              type="welcome" 
              name={cardRef.current?.name || cardRef.current?.voter_name || profileRef.current?.name || 'Member'}
              date={
                createdAt
                  ? new Date(createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                  : (cardRef.current?.created_at || profileRef.current?.created_at || cardRef.current?.generated_at || profileRef.current?.generated_at)
                    ? new Date(cardRef.current?.created_at || profileRef.current?.created_at || cardRef.current?.generated_at || profileRef.current?.generated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
              }
              refCode={cardRef.current?.wtl_code || cardRef.current?.ptc_code || profileRef.current?.wtl_code || profileRef.current?.ptc_code}
              epicNo={epicRef.current || cardRef.current?.epic_no || profileRef.current?.epic_no}
              onBack={() => setActiveView('chat')} 
            />
          ) : activeView === 'appreciation_letter' ? (
            <FullLetterPanel 
              type="appreciation" 
              name={cardRef.current?.name || cardRef.current?.voter_name || profileRef.current?.name || 'Member'}
              date={
                appreciationEarnedAt
                  ? new Date(appreciationEarnedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                  : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
              }
              refCode={cardRef.current?.wtl_code || cardRef.current?.ptc_code || profileRef.current?.wtl_code || profileRef.current?.ptc_code}
              epicNo={epicRef.current || cardRef.current?.epic_no || profileRef.current?.epic_no}
              onBack={() => setActiveView('chat')} 
            />
          ) : activeView === 'referral' ? (
            <FullReferralPanel
              link={cardRef.current?.referral_link || ''}
              onBack={() => setActiveView('chat')}
            />
          ) : activeView === 'best_performers' ? (
            <BestPerformersPanel onBack={() => setActiveView('chat')} />
          ) : activeView === 'volunteer' ? (
            <FullFormPanel title="Be a BJP Organizer" icon="hand-thumbs-up-fill" onBack={() => setActiveView('chat')}>
              <SelectWingMsg
                wtlCode={cardRef.current?.wtl_code || cardRef.current?.ptc_code || profileRef.current?.wtl_code || profileRef.current?.ptc_code}
                epicNo={epicRef.current}
                isLatest={true}
              />
            </FullFormPanel>
          ) : activeView === 'booth_agent' ? (
            <FullFormPanel title="Be a Booth Agent" icon="building-fill-check" onBack={() => setActiveView('chat')}>
              <BoothAgentSetupMsg
                wtlCode={cardRef.current?.wtl_code || cardRef.current?.ptc_code || profileRef.current?.wtl_code || profileRef.current?.ptc_code}
                epicNo={epicRef.current}
                isLatest={true}
              />
            </FullFormPanel>
          ) : activeView === 'local_body' ? (
            <LocalBodyPanel 
              onBack={() => setActiveView('chat')} 
              localBodyInterest={localBodyInterest}
              handleLocalBodyInterestSubmit={handleLocalBodyInterestSubmit}
            />
          ) : activeView === 'my_members' ? (
            <FullMyMembersPanel 
              wtlCode={cardRef.current?.wtl_code || cardRef.current?.ptc_code || profileRef.current?.wtl_code || profileRef.current?.ptc_code}
              onBack={() => setActiveView('chat')} 
            />
          ) : (
            <div className="chatbot-container">


            {/* Header */}
            <header className="chat-header">
              <div
                className="chat-header-avatar"
                onClick={() => isDone && handleSidebarOpen()}
              >
                <img src="/bjp_logo.svg" alt="BJP" onError={(e) => { e.target.style.display = 'none' }} />
              </div>
              <div className="chat-header-info">
                <div className="chat-header-name">BJP TAMIL NADU</div>
                <div className="chat-header-status">
                  {chatState === S.GENERATING ? (
                    <><span className="status-dot-pulsing" /> Generating membership card...</>
                  ) : isDone ? (
                    <><span className="status-dot-green" /> Online</>
                  ) : (
                    <><span className="status-dot-green" /> Registration in progress</>
                  )}
                </div>
              </div>
              <div className="chat-header-actions" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {isDone && (
                  <button
                    className={`chat-header-btn bell-alert-btn ${
                      hasPendingNotification ? 'pulsing-vibrate' : ''
                    } ${hasAppointment ? 'bell-booked-btn' : ''}`}
                    onClick={handleBellClick}
                    title={
                      hasAppointment 
                        ? 'Meeting Scheduled! Click to view details' 
                        : 'Milestone Achieved! Click to Schedule Meeting with President'
                    }
                    style={{ 
                      fontSize: 18, 
                      color: hasAppointment ? '#2ecc71' : '#D1B078', 
                      border: 'none', 
                      background: 'none', 
                      cursor: 'pointer' 
                    }}
                  >
                    <i className="bi bi-bell-fill" />
                    {hasPendingNotification && <span className="bell-badge" />}
                  </button>
                )}
                {isDone && (
                  <button
                    className="chat-header-btn"
                    onClick={handleSidebarOpen}
                    title="Menu"
                  >
                    <i className="bi bi-list" />
                  </button>
                )}
              </div>
            </header>

            {/* Messages */}
            <main className="chat-messages">
              {messages.map((msg) => {
                const isLatest = messages[messages.length - 1]?.id === msg.id
                const isPhotoRequest = isLatest && chatState === S.AWAIT_PHOTO && msg.from === 'bot' && msg.type === 'text'

                if (isPhotoRequest) {
                  const safeHtml = String(msg.text || '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
                  return (
                    <div key={msg.id} className="msg-row bot">
                      <div className="msg-bubble msg-bubble-interactive">
                        <div className="interactive-body">
                          <span dangerouslySetInnerHTML={{ __html: safeHtml }} />
                          <div className="msg-time" style={{ marginTop: 8 }}>
                            {fmtTime(msg.ts)}
                          </div>
                        </div>
                        <div className="interactive-buttons">
                          <button className="interactive-btn" onClick={() => fileInputRef.current?.click()}>
                            <i className="bi bi-cloud-upload-fill" /> Upload Image
                          </button>
                          <button className="interactive-btn" onClick={() => cameraInputRef.current?.click()}>
                            <i className="bi bi-camera-fill" /> Take Photo
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                }

                return (
                  <div
                    key={msg.id}
                    className={`msg-row ${msg.from}`}
                  >
                    <div className={`msg-bubble ${['voter_card','generated_card','booth_info','referral_link','members_list','profile_card','welcome_banner','welcome_letter','appreciation_letter'].includes(msg.type) ? 'wide' : ''}`}>
                      {renderMsgContent(msg)}
                      <div className="msg-time">
                        {fmtTime(msg.ts)}
                      </div>
                    </div>
                  </div>
                )
              })}

              {isTyping && (
                <div className="msg-row bot">
                  <div className="typing-bubble" role="status" aria-label="Bot is typing">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} style={{ height: 8 }} />
            </main>

            {/* Input area */}
            <footer className="chat-input-area">
              {chatState === S.CONFIRM ? (
                null
              ) : chatState === S.AWAIT_PHOTO ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => { handleFileSelect(e.target.files?.[0]); e.target.value = '' }}
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="user"
                    style={{ display: 'none' }}
                    onChange={(e) => { handleFileSelect(e.target.files?.[0]); e.target.value = '' }}
                  />
                </>
              ) : chatState === S.GENERATING ? (
                <div className="generating-bar">
                  <div className="spinner-border spinner-border-sm text-success" role="status" />
                  <span>Generating your card, please wait...</span>
                </div>
              ) : isDone && !inputCfg ? (
                <div className="chat-form done-bar">
                  <div className="chat-input-wrapper">
                    <span className="done-status">
                      <i className="bi bi-shield-fill-check text-success" />
                      Card Generated Successfully
                    </span>
                  </div>
                  <button className="chat-send-btn menu-btn" onClick={handleSidebarOpen} title="Menu" style={{ position: 'relative' }}>
                    <i className="bi bi-grid-3x3-gap-fill" />
                    {hasSidebarNotification && <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: '50%', background: '#e53935', display: 'block' }} />}
                  </button>
                </div>
              ) : inputCfg ? (
                <form className="chat-form" onSubmit={handleSubmit}>
                  <div className="chat-input-wrapper">
                    <input
                      className="chat-input"
                      value={inputValue}
                      onChange={handleInputChange}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
                      placeholder={inputCfg.placeholder}
                      aria-label={inputCfg.placeholder}
                      type={inputCfg.type}
                      maxLength={inputCfg.maxLength}
                      inputMode={inputCfg.inputMode}
                      autoComplete="off"
                      disabled={isTyping}
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    className="chat-send-btn"
                    disabled={getIsSendDisabled()}
                  >
                    <i className="bi bi-send-fill" />
                  </button>
                </form>
              ) : null}
            </footer>
          </div>
          )}
        </div>
      </div>

      {/* ── Sidebar ── */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)}>
          <div className="sidebar-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sidebar-header" style={{ position: 'relative' }}>
              <img src="/bjp_logo.svg" alt="BJP" className="sidebar-logo"
                onError={(e) => { e.target.src = '/bjp_logo.png' }} />
              <div>
                <div className="sidebar-brand">BJP TAMIL NADU</div>
                <div className="sidebar-tagline">Nation First. Party Next. Self Last.</div>
              </div>
              <button 
                onClick={() => setSidebarOpen(false)}
                style={{
                  position: 'absolute',
                  top: '50%',
                  right: 16,
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-ash)',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10
                }}
                aria-label="Close sidebar"
              >
                <i className="bi bi-x" />
              </button>
            </div>
            <nav className="sidebar-nav">
              {[
                { icon: 'person-circle',       label: 'My Profile',       action: 'profile' },
                { icon: 'credit-card-2-front', label: 'My Card',          action: 'my_card' },
                { icon: 'envelope-paper-fill', label: 'My Welcome Letter', action: 'welcome_letter' },
                { icon: 'book-fill',           label: 'BJP Brochure',     action: 'brochure' },
                { icon: 'award-fill',          label: 'My Appreciation Letter', action: 'appreciation_letter' },
                { icon: 'building',            label: 'Booth Info',        action: 'booth_info' },
                { icon: 'link-45deg',          label: 'Referral Link',     action: 'referral' },
                { icon: 'people-fill',         label: 'My Members',        action: 'my_members' },
                { icon: 'hand-thumbs-up-fill', label: 'Be an Organizer',    action: 'volunteer' },
                { icon: 'building-fill-check', label: 'Be a Booth Agent',  action: 'booth_agent' },
                { icon: 'check-square-fill',   label: 'Local Body Election', action: 'local_body' },
              ].map((item) => {
                const isComingSoon = false
                const isLocked = item.action === 'appreciation_letter' && referredCount < 5
                const itemHasNotif =
                  (item.action === 'volunteer' && hasVolunteerNotif) ||
                  (item.action === 'booth_agent' && hasBoothAgentNotif)
                const notifStatus =
                  item.action === 'volunteer' ? volunteerStatus :
                  item.action === 'booth_agent' ? boothAgentStatus : null
                return (
                  <button
                    key={item.action}
                    className={`sidebar-nav-item ${isComingSoon || isLocked ? 'locked' : ''}`}
                    onClick={() => !isComingSoon && !isLocked && handleSidebarAction(item.action)}
                    style={isComingSoon || isLocked ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <i className={`bi bi-${item.icon}`} />
                        <span>{item.label}</span>
                        {isComingSoon && <span className="coming-soon-badge">Coming Soon</span>}
                        {itemHasNotif && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            background: notifStatus === 'confirmed' ? 'rgba(46,204,113,0.15)' : 'rgba(229,57,53,0.15)',
                            color: notifStatus === 'confirmed' ? '#2ecc71' : '#e53935',
                            border: `1px solid ${notifStatus === 'confirmed' ? '#2ecc71' : '#e53935'}`,
                            borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700,
                            animation: 'pulse 1.5s infinite'
                          }}>
                            {notifStatus === 'confirmed'
                              ? <><i className="bi bi-check-circle-fill" /> Accepted</>  
                              : <><i className="bi bi-x-circle-fill" /> Rejected</>}
                          </span>
                        )}
                      </div>
                      {(isComingSoon || isLocked) && <i className="bi bi-lock-fill" style={{ fontSize: 12, opacity: 0.8 }} />}
                    </div>
                  </button>
                )
              })}
            </nav>
            <div className="sidebar-footer">
              <button className="sidebar-logout-btn" onClick={handleLogout}>
                <i className="bi bi-box-arrow-left" /> Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crop Modal */}
      {cropOpen && cropSrc && (
        <CropModal
          src={cropSrc}
          onCrop={handleCropComplete}
          onCancel={() => { setCropOpen(false); setCropSrc('') }}
        />
      )}

      {/* Card Full View Modal */}
      {modalCard && (
        <CardModal
          cardData={modalCard}
          onClose={() => setModalCard(null)}
        />
      )}

      {/* Appointment Booking Modal */}
      {showModal && (
        <div className="appointment-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="appointment-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowModal(false)}>&times;</button>
            
            {bookingStep === 1 && (
              <div className="modal-step-congrats">
                <div className="modal-icon-wrapper congrats">
                  <i className="bi bi-trophy-fill congrats-icon" />
                </div>
                <h2>Congratulations! 🎉</h2>
                <p className="congrats-text">
                  You have successfully completed <strong>5 referrals</strong>! As a token of appreciation for your outstanding support, you have earned a special opportunity to meet the State President. Are you interested in scheduling a meeting?
                </p>
                {bookingError && <p className="modal-error-text" style={{ color: '#ff3b30', fontSize: 12, marginBottom: 16 }}>⚠️ {bookingError}</p>}
                <div className="modal-actions-row" style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                  <button 
                    className="btn-modal-action btn-schedule" 
                    style={{ flex: 1 }}
                    onClick={() => handleMeetingInterestSubmit('interested')}
                    disabled={isBooking}
                  >
                    {isBooking ? 'Saving...' : 'Interested'}
                  </button>
                  <button 
                    className="btn-modal-action btn-cancel" 
                    style={{ flex: 1, border: '1px solid var(--border-dim)' }}
                    onClick={() => handleMeetingInterestSubmit('not_interested')}
                    disabled={isBooking}
                  >
                    {isBooking ? 'Saving...' : 'Not Interested'}
                  </button>
                </div>
              </div>
            )}

            {bookingStep === 3 && (
              <div className="modal-step-success">
                <div className="modal-icon-wrapper success">
                  <i className="bi bi-check-circle-fill success-icon" />
                </div>
                <h2>Preference Saved! 🗓️</h2>
                <p className="success-text">
                  {meetingInterest === 'interested'
                    ? 'Thanks for your interest! Your request to meet the State President has been recorded. Our team will contact you soon.'
                    : 'Thank you for your response. Your preference has been successfully recorded.'
                  }
                </p>
                <div className="modal-actions-row">
                  <button className="btn-modal-action btn-schedule" onClick={() => setShowModal(false)}>
                    Done
                  </button>
                </div>
              </div>
            )}

            {bookingStep === 4 && (
              <div className="modal-step-local-body">
                <div className="modal-icon-wrapper congrats" style={{ background: 'rgba(209, 176, 120, 0.12)' }}>
                  <i className="bi bi-building congrats-icon" style={{ color: '#D1B078' }} />
                </div>
                <h2>Local Body Elections 🗳️</h2>
                <p className="congrats-text" style={{ fontSize: 13, lineHeight: '1.5' }}>
                  Are you interested in participating or contesting in the upcoming Local Body Elections? BJP Tamil Nadu is planning candidate profiles and coordinators for each ward/panchayat. Let us know your interest below:
                </p>
                {bookingError && <p className="modal-error-text" style={{ color: '#ff3b30', fontSize: 12, marginBottom: 16 }}>⚠️ {bookingError}</p>}
                <div className="modal-actions-row" style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                  <button 
                    className="btn-modal-action btn-schedule" 
                    style={{ flex: 1 }}
                    onClick={() => handleLocalBodyInterestSubmit('interested')}
                    disabled={isBooking}
                  >
                    {isBooking ? 'Saving...' : 'Interested'}
                  </button>
                  <button 
                    className="btn-modal-action btn-cancel" 
                    style={{ flex: 1, border: '1px solid var(--border-dim)' }}
                    onClick={() => handleLocalBodyInterestSubmit('not_interested')}
                    disabled={isBooking}
                  >
                    {isBooking ? 'Saving...' : 'Not Interested'}
                  </button>
                </div>
              </div>
            )}

            {bookingStep === 5 && (
              <div className="modal-step-success">
                <div className="modal-icon-wrapper success">
                  <i className="bi bi-check-circle-fill success-icon" />
                </div>
                <h2>Thank You! 🙏</h2>
                <p className="success-text" style={{ fontSize: 13, lineHeight: '1.5' }}>
                  {localBodyInterest === 'interested' 
                    ? 'Thanks for your interest! Your preference has been recorded. Our team will reach out to you with further updates.'
                    : 'Thank you for your response. Your preference has been successfully recorded.'
                  }
                </p>
                <div className="modal-actions-row" style={{ marginTop: 20 }}>
                  <button className="btn-modal-action btn-schedule" onClick={() => {
                    setShowModal(false);
                    // If they have met milestones (referredCount >= 5) and don't have an appointment yet, route them back to step 1
                    if (referredCount >= 5 && !hasAppointment) {
                      setBookingStep(1);
                    }
                  }}>
                    Close
                  </button>
                </div>
              </div>
            )}

            {bookingStep === 6 && (
              <div className="modal-step-success">
                <div className="modal-icon-wrapper success" style={{ backgroundColor: 'rgba(46, 125, 50, 0.12)' }}>
                  <i className="bi bi-patch-check-fill success-icon" style={{ color: '#2e7d32' }} />
                </div>
                <h2>Congratulations Organizer! 🎉</h2>
                <p className="success-text" style={{ fontSize: 13, lineHeight: '1.5' }}>
                  Your application to become a BJP Organizer has been accepted by the State Administrator. Thank you for your leadership and dedication to the party!
                </p>
                <div className="modal-actions-row" style={{ marginTop: 20 }}>
                  <button className="btn-modal-action btn-schedule" style={{ backgroundColor: '#2e7d32' }} onClick={() => handleAcknowledgeStatus('volunteer', 'confirmed')}>
                    Done
                  </button>
                </div>
              </div>
            )}

            {bookingStep === 7 && (
              <div className="modal-step-success">
                <div className="modal-icon-wrapper success" style={{ backgroundColor: 'rgba(198, 40, 40, 0.12)' }}>
                  <i className="bi bi-x-circle-fill success-icon" style={{ color: '#c62828' }} />
                </div>
                <h2>Organizer Application ℹ️</h2>
                <p className="success-text" style={{ fontSize: 13, lineHeight: '1.5' }}>
                  Your application to become a BJP Organizer has been reviewed and rejected by the State Administrator at this time. Thank you for your interest; you can continue to participate and refer new members.
                </p>
                <div className="modal-actions-row" style={{ marginTop: 20 }}>
                  <button className="btn-modal-action btn-schedule" style={{ backgroundColor: '#c62828' }} onClick={() => handleAcknowledgeStatus('volunteer', 'rejected')}>
                    Done
                  </button>
                </div>
              </div>
            )}

            {bookingStep === 8 && (
              <div className="modal-step-success">
                <div className="modal-icon-wrapper success" style={{ backgroundColor: 'rgba(21, 101, 192, 0.12)' }}>
                  <i className="bi bi-shield-fill-check success-icon" style={{ color: '#1565c0' }} />
                </div>
                <h2>Congratulations Booth Agent! 🗳️</h2>
                <p className="success-text" style={{ fontSize: 13, lineHeight: '1.5' }}>
                  Your application to become a BJP Booth Agent has been confirmed by the State Administrator. You are now officially assigned to your booth! Thank you for your valuable support.
                </p>
                <div className="modal-actions-row" style={{ marginTop: 20 }}>
                  <button className="btn-modal-action btn-schedule" style={{ backgroundColor: '#1565c0' }} onClick={() => handleAcknowledgeStatus('booth_agent', 'confirmed')}>
                    Done
                  </button>
                </div>
              </div>
            )}

            {bookingStep === 9 && (
              <div className="modal-step-success">
                <div className="modal-icon-wrapper success" style={{ backgroundColor: 'rgba(198, 40, 40, 0.12)' }}>
                  <i className="bi bi-x-circle-fill success-icon" style={{ color: '#c62828' }} />
                </div>
                <h2>Booth Agent Application ℹ️</h2>
                <p className="success-text" style={{ fontSize: 13, lineHeight: '1.5' }}>
                  Your application to become a BJP Booth Agent has been reviewed and rejected by the State Administrator at this time. Thank you for your interest.
                </p>
                <div className="modal-actions-row" style={{ marginTop: 20 }}>
                  <button className="btn-modal-action btn-schedule" style={{ backgroundColor: '#c62828' }} onClick={() => handleAcknowledgeStatus('booth_agent', 'rejected')}>
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
