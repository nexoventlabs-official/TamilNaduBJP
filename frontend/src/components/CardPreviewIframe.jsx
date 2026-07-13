import React, { useRef, useEffect, useState } from 'react'

export const CardPreviewIframe = React.forwardRef(({ cardData, width = 340 }, ref) => {
  const iframeRef = useRef(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
  }, [cardData])

  const download = () => {
    const iframe = iframeRef.current
    if (iframe && iframe.contentWindow && typeof iframe.contentWindow.downloadPNG === 'function') {
      iframe.contentWindow.downloadPNG()
    }
  }

  React.useImperativeHandle(ref, () => ({
    download
  }))

  const handleIframeLoad = () => {
    setLoading(false)
    const iframe = iframeRef.current
    if (!iframe || !cardData) return

    try {
      const doc = iframe.contentDocument || iframe.contentWindow.document
      if (!doc) return

      // Hide the form panel
      const formPanel = doc.querySelector('.form-panel')
      if (formPanel) {
        formPanel.style.display = 'none'
      }

      // Format body for transparent, borderless container
      doc.body.style.background = 'transparent'
      doc.body.style.padding = '0'
      doc.body.style.margin = '0'
      doc.body.style.display = 'block'
      doc.body.style.overflow = 'hidden'

      const cardWrap = doc.querySelector('.card-wrap')
      if (cardWrap) {
        cardWrap.style.transform = 'none'
        cardWrap.style.margin = '0'
        cardWrap.style.marginBottom = '0'
      }

      // Populate input values
      const nameInput = doc.getElementById('f-name')
      const epicInput = doc.getElementById('f-epic')
      const asmInput = doc.getElementById('f-asm')
      const boothInput = doc.getElementById('f-booth')
      const distInput = doc.getElementById('f-dist')
      const midInput = doc.getElementById('f-mid')
      const photoImg = doc.getElementById('member-photo-img')
      const qrImg = doc.getElementById('qr-img')

      const name = String(cardData.name || cardData.voter_name || cardData.VOTER_NAME || '')
                    .replace(/-/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()
      const epic = String(cardData.epic_no || cardData.EPIC_NO || '').toUpperCase()
      const assembly = String(cardData.assembly_name || cardData.assembly || cardData.ASSEMBLY_NAME || '').toUpperCase()
      const booth = String(cardData.part_no || cardData.booth_no || cardData.PART_NO || '')
      const district = String(cardData.district || cardData.DISTRICT || cardData.DISTRICT_NAME || '').toUpperCase()
      const wtlCode = cardData.wtl_code || cardData.ptc_code || cardData.PTC_CODE || ''
      const midVal = wtlCode || (epic ? `BJP-${epic.slice(-6)}` : '')
      const photoUrl = cardData.photo_url || cardData.PHOTO_URL || ''

      if (nameInput) nameInput.value = name
      if (epicInput) epicInput.value = epic
      if (asmInput) asmInput.value = assembly
      if (boothInput) boothInput.value = booth
      if (distInput) distInput.value = district
      if (midInput) midInput.value = midVal.toUpperCase()

      if (photoImg && photoUrl) {
        photoImg.crossOrigin = 'anonymous';
        photoImg.src = photoUrl
        photoImg.style.display = 'block'
        const photoBox = doc.getElementById('photo-box')
        if (photoBox) {
          const svg = photoBox.querySelector('svg')
          const span = photoBox.querySelector('span')
          if (svg) svg.style.display = 'none'
          if (span) span.style.display = 'none'
        }
      } else if (photoImg) {
        photoImg.style.display = 'none'
        const photoBox = doc.getElementById('photo-box')
        if (photoBox) {
          const svg = photoBox.querySelector('svg')
          const span = photoBox.querySelector('span')
          if (svg) svg.style.display = 'block'
          if (span) span.style.display = 'block'
        }
      }

      if (qrImg && epic) {
        let qrData = cardData.referral_link || '';
        if (!qrData && wtlCode && cardData.referral_id) {
          qrData = `${window.location.origin}/refer/${wtlCode}/${cardData.referral_id}`;
        }
        if (!qrData) {
          qrData = `${window.location.origin}/verify/${wtlCode || epic}`;
        }
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&ecc=H&data=${encodeURIComponent(qrData)}`;
      }

      // Trigger generate card preview inside template
      if (iframe.contentWindow && typeof iframe.contentWindow.generate === 'function') {
        iframe.contentWindow.generate()
      }

      // Hide profile icon, NAME label, and colon for the first field row, and let the name slide left
      const firstRow = doc.querySelector('.fields .field-row')
      if (firstRow) {
        const icon = firstRow.querySelector('.field-icon')
        const label = firstRow.querySelector('.field-label')
        const colon = firstRow.querySelector('.field-colon')
        const val = firstRow.querySelector('.field-value')
        if (icon) icon.style.display = 'none'
        if (label) label.style.display = 'none'
        if (colon) colon.style.display = 'none'
        if (val) {
          val.style.maxWidth = '600px'
        }
      }
    } catch (e) {
      console.error('Error pre-filling preview iframe:', e)
    }
  }

  // Calculate scale based on target width (card original width is 1576)
  const scale = width / 1576
  const height = Math.round(998 * scale)

  return (
    <div style={{
      width: `${width}px`,
      height: `${height}px`,
      overflow: 'hidden',
      position: 'relative',
      borderRadius: '12px',
      border: '1px solid var(--color-graphite)',
      background: '#F9F8F6',
    }}>
      {loading && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: '#f8f9fa',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10,
          padding: '16px',
          boxSizing: 'border-box',
          gap: '16px',
        }}>
          <style>{`
            @keyframes pulse {
              0% { opacity: 0.6; }
              50% { opacity: 0.3; }
              100% { opacity: 0.6; }
            }
            .skeleton-element {
              animation: pulse 1.5s infinite ease-in-out;
              background: rgba(0, 0, 0, 0.06);
              border-radius: 6px;
            }
          `}</style>
          {/* Header Banner */}
          <div className="skeleton-element" style={{ width: '100%', height: '30%', borderRadius: '8px', background: 'linear-gradient(90deg, rgba(242,101,34,0.2) 0%, rgba(255,153,51,0.1) 100%)' }} />
          {/* Circular Photo */}
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', width: '100%' }}>
            <div className="skeleton-element" style={{ width: '48px', height: '48px', borderRadius: '50%' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
              <div className="skeleton-element" style={{ width: '70%', height: '12px' }} />
              <div className="skeleton-element" style={{ width: '40%', height: '8px' }} />
            </div>
          </div>
          {/* Details lines */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, justifyContent: 'center' }}>
            <div className="skeleton-element" style={{ width: '90%', height: '10px' }} />
            <div className="skeleton-element" style={{ width: '85%', height: '10px' }} />
            <div className="skeleton-element" style={{ width: '80%', height: '10px' }} />
            <div className="skeleton-element" style={{ width: '50%', height: '10px' }} />
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src="/bjp_card_design.html?v=2"
        title="Card Preview"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '1576px',
          height: '998px',
          border: 'none',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
          maxWidth: 'none',
        }}
        onLoad={handleIframeLoad}
      />
    </div>
  )
})
