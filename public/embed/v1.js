/* AI Central · embed v1
 *
 * Drop a target div + this script onto any page and you get a pill button
 * that opens the AI Central quiz in a popup, slider, or inline iframe.
 *
 * Usage:
 *   <div data-ac-survey-id="quiz"
 *        data-ac-embed-type="slider"
 *        data-button-text="Take the quiz"
 *        data-button-size="large"
 *        data-button-float="bottom-right"
 *        data-button-color="#E48715"
 *        data-slider-direction="right"
 *        data-inherit-parameters
 *        data-utm_source="homepage_slider"></div>
 *   <script src="https://ai-central-quiz.vercel.app/embed/v1.js"></script>
 *
 * Embed types: popup · slider · standard · fullscreen
 * Listens for postMessage from the iframe for dynamic resize + auto-close
 * on form submission.
 */
(() => {
  'use strict'
  if (typeof window === 'undefined') return

  // ── Config ─────────────────────────────────────────────────────
  // Default base URL points at the AI Central deployment hosting this
  // snippet. Override per-embed with `data-ac-domain`.
  const SCRIPT_TAG = document.currentScript || (function () {
    const all = document.getElementsByTagName('script')
    return all[all.length - 1]
  })()
  const SCRIPT_ORIGIN = SCRIPT_TAG ? new URL(SCRIPT_TAG.src, window.location.href).origin : 'https://ai-central-quiz.vercel.app'

  // Survey-id → path lookup. Add new surveys here as they ship.
  const SURVEY_PATHS = {
    'quiz':    '/quiz',
    'quiz-v2': '/quiz-v2',
  }

  // ── Styles ─────────────────────────────────────────────────────
  const baseStyles = `
@keyframes ac-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.ac-noscroll { overflow: hidden; }

/* Popup / slider background scrim */
.ac-popup-bg, .ac-slider-bg {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,.65);
  transition: opacity .25s ease-in-out;
  z-index: 2147483647;  /* max */
  display: flex;
}
.ac-popup-bg { align-items: center; justify-content: center; }

/* Popup body */
.ac-popup-body, .ac-slider-body {
  position: relative;
  transition: opacity .25s ease-in-out;
  min-width: 360px; min-height: 360px;
  background: white;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 25px 60px rgba(0,0,0,.35);
}
.ac-popup-body iframe, .ac-slider-body iframe {
  width: 100%; height: 100%; border: none; display: block;
}

/* Close icon — circular X */
.ac-close {
  position: absolute; top: -15px; right: -15px;
  width: 24px; height: 24px;
  background: #171717; color: #fff;
  border-radius: 50%; padding: 6px;
  cursor: pointer;
  box-sizing: content-box;
  text-decoration: none;
  transition: transform .2s ease, opacity .25s ease;
  opacity: 0;
}
.ac-close:hover { transform: scale(1.08); }

/* Loading spinner */
.ac-loading {
  position: absolute; top: 50%; left: 50%;
  width: 24px; height: 24px;
  margin: -12px 0 0 -12px;
  border: 4px solid rgba(255,255,255,.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: ac-spin 1s linear infinite;
}

/* Slider — full-height side panel */
.ac-slider-body {
  position: absolute; top: 0;
  height: 100%; width: 80vw;
  max-width: 720px;
  border-radius: 0;
  transition: transform .35s ease-in-out;
}
.ac-slider-right { right: 0; transform: translateX(100%); }
.ac-slider-left  { left:  0; transform: translateX(-100%); }
.ac-slider-open.ac-slider-right { transform: translateX(0); }
.ac-slider-open.ac-slider-left  { transform: translateX(0); }
.ac-slider-body .ac-close {
  top: 12px; right: 12px;
}

/* Mobile */
@media (max-width: 600px) {
  .ac-popup-body, .ac-slider-body {
    width: 100vw !important; max-width: 100vw !important;
    height: 100vh !important; max-height: 100vh !important;
    border-radius: 0;
  }
  .ac-close { top: 12px; right: 12px; }
}
  `
  function ensureStyles() {
    if (document.getElementById('ac-embed-styles')) return
    const tag = document.createElement('style')
    tag.id = 'ac-embed-styles'
    tag.textContent = baseStyles
    document.head.appendChild(tag)
  }

  // ── Helpers ────────────────────────────────────────────────────
  function genId() {
    return 'ac-' + Math.random().toString(36).slice(2, 12)
  }

  function hexToRgb(hex) {
    if (typeof hex !== 'string' || !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex)) {
      return [228, 135, 21] // default Fulvous #E48715
    }
    const n = parseInt(hex.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  function luminance(hex) {
    const [r, g, b] = hexToRgb(hex).map(c => {
      c /= 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  function readableTextColor(hex) {
    return luminance(hex) > 0.5 ? '#171717' : '#FFFDFA'
  }

  function getConfig(el) {
    const ds = el.dataset
    return {
      surveyId: ds.acSurveyId || 'quiz',
      embedType: ds.acEmbedType || 'popup',
      buttonText: ds.buttonText || 'Take the quiz',
      buttonColor: ds.buttonColor || '#E48715',
      buttonSize: ds.buttonSize || 'medium',
      buttonFloat: ds.buttonFloat || '',
      sliderDirection: ds.sliderDirection === 'left' ? 'left' : 'right',
      popupSize: ds.popupSize || 'large',
      inheritParameters: 'inheritParameters' in ds,
      domain: ds.acDomain || SCRIPT_ORIGIN,
    }
  }

  function buildIframeUrl(cfg, el, embedId) {
    const path = SURVEY_PATHS[cfg.surveyId] || ('/' + cfg.surveyId.replace(/^\//, ''))
    const url = new URL(path, cfg.domain)
    url.searchParams.set('embed', '1')
    url.searchParams.set('ac-embed-id', embedId)
    // Inherit parent page's search params (utm_source, ref, etc.)
    if (cfg.inheritParameters) {
      const parent = new URL(window.location.href).searchParams
      for (const [k, v] of parent.entries()) url.searchParams.append(k, v)
    }
    // Pass through any non-namespaced data-* attributes (e.g. data-utm_source)
    for (const attr of el.attributes) {
      const n = attr.name
      if (n.startsWith('data-') && !n.startsWith('data-ac-') && !n.startsWith('data-button-')
          && !n.startsWith('data-slider-') && !n.startsWith('data-popup-')
          && !n.startsWith('data-inherit-')) {
        url.searchParams.append(n.slice(5), attr.value)
      }
    }
    return url.toString()
  }

  function makeButton(el, cfg, onClick) {
    if (el.tagName !== 'DIV') {
      el.onclick = onClick
      return
    }
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.innerText = cfg.buttonText
    btn.onclick = onClick
    const textColor = readableTextColor(cfg.buttonColor)
    const sizes = {
      small:  { padding: '8px 14px',  fontSize: '14px', borderRadius: '24px' },
      medium: { padding: '10px 18px', fontSize: '16px', borderRadius: '28px' },
      large:  { padding: '14px 22px', fontSize: '18px', borderRadius: '32px' },
    }
    const sz = sizes[cfg.buttonSize] || sizes.medium
    Object.assign(btn.style, {
      cursor: 'pointer',
      fontFamily: 'Inter, Helvetica, Arial, sans-serif',
      fontWeight: '700',
      color: textColor,
      background: cfg.buttonColor,
      border: 'none',
      boxShadow: '0 4px 12px rgba(0,0,0,.18)',
      transition: 'transform .15s ease, box-shadow .2s ease',
      padding: sz.padding,
      fontSize: sz.fontSize,
      borderRadius: sz.borderRadius,
      display: 'inline-block',
      maxWidth: '100%',
      whiteSpace: 'nowrap',
      lineHeight: '1.2',
    })
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-1px)'
      btn.style.boxShadow = '0 8px 18px rgba(0,0,0,.24)'
    })
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = ''
      btn.style.boxShadow = '0 4px 12px rgba(0,0,0,.18)'
    })
    if (cfg.buttonFloat) {
      const floats = {
        'bottom-right': { position: 'fixed', bottom: '24px', right: '24px', zIndex: '2147483646' },
        'bottom-left':  { position: 'fixed', bottom: '24px', left:  '24px', zIndex: '2147483646' },
      }
      Object.assign(btn.style, floats[cfg.buttonFloat] || {})
    }
    el.appendChild(btn)
  }

  const X_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>'

  // ── Open popup / slider ────────────────────────────────────────
  function openPopupLike(el, cfg) {
    const embedType = cfg.embedType  // 'popup' or 'slider'
    const embedId = genId()
    const isSlider = embedType === 'slider'

    const scrim = document.createElement('div')
    scrim.className = isSlider ? 'ac-slider-bg' : 'ac-popup-bg'
    scrim.style.opacity = '0'

    const body = document.createElement('div')
    body.className = isSlider ? `ac-slider-body ac-slider-${cfg.sliderDirection}` : 'ac-popup-body'

    if (!isSlider) {
      // popup sizing
      const popupSizes = {
        small:  { w: '560px',  h: '720px' },
        medium: { w: '900px',  h: '85vh'  },
        large:  { w: '1100px', h: '90vh'  },
      }
      const ps = popupSizes[cfg.popupSize] || popupSizes.large
      body.style.width  = `min(${ps.w}, calc(100vw - 80px))`
      body.style.height = `min(${ps.h}, calc(100vh - 60px))`
    }

    const spinner = document.createElement('div')
    spinner.className = 'ac-loading'
    body.appendChild(spinner)

    const iframe = document.createElement('iframe')
    iframe.src = buildIframeUrl(cfg, el, embedId)
    iframe.allow = 'microphone; camera; geolocation'
    iframe.setAttribute('title', 'AI Central quiz')
    iframe.style.opacity = '0'
    iframe.addEventListener('load', () => {
      spinner.remove()
      iframe.style.opacity = '1'
      close.style.opacity = '1'
    })

    const close = document.createElement('a')
    close.className = 'ac-close'
    close.innerHTML = X_ICON
    close.href = 'javascript:void(0)'

    body.appendChild(iframe)
    body.appendChild(close)
    scrim.appendChild(body)
    document.body.appendChild(scrim)
    document.body.classList.add('ac-noscroll')

    // Animate in
    requestAnimationFrame(() => {
      scrim.style.opacity = '1'
      if (isSlider) body.classList.add('ac-slider-open')
    })

    function destroy() {
      document.body.classList.remove('ac-noscroll')
      scrim.style.opacity = '0'
      if (isSlider) body.classList.remove('ac-slider-open')
      setTimeout(() => scrim.remove(), 380)
      window.removeEventListener('message', onMessage)
      document.removeEventListener('keydown', onKey)
    }

    // ESC + click outside + X
    function onKey(e) { if (e.key === 'Escape') destroy() }
    document.addEventListener('keydown', onKey)
    close.addEventListener('click', destroy)
    scrim.addEventListener('click', (e) => {
      if (e.target === scrim) destroy()
    })

    // postMessage from iframe
    function onMessage(e) {
      const d = e.data
      if (!d || typeof d !== 'object' || d.source !== 'ai-central-quiz') return
      if (d.embedId && d.embedId !== embedId) return
      if (d.type === 'form_submitted') {
        // Brief delay so user sees the success state inside iframe, then close
        setTimeout(destroy, 1800)
        // Bubble to host page so they can hook analytics
        try {
          const ev = new CustomEvent('ac-quiz-submitted', { detail: d })
          window.dispatchEvent(ev)
        } catch (_) {}
      }
    }
    window.addEventListener('message', onMessage, false)
  }

  // ── Inline / standard / fullscreen embed ───────────────────────
  function openStandard(el, cfg, fullscreen) {
    const embedId = genId()
    const wrap = document.createElement('div')
    wrap.style.position = 'relative'
    wrap.style.width  = '100%'
    wrap.style.height = fullscreen ? '100vh' : '720px'  // fallback height; iframe will resize
    wrap.style.transition = 'height 150ms ease'

    const iframe = document.createElement('iframe')
    iframe.src = buildIframeUrl(cfg, el, embedId)
    iframe.allow = 'microphone; camera; geolocation'
    iframe.style.cssText = `width:100%;height:100%;border:0;border-radius:${fullscreen ? '0' : '12px'};display:block;`
    iframe.setAttribute('title', 'AI Central quiz')
    wrap.appendChild(iframe)
    el.appendChild(wrap)

    // Listen for resize so the iframe grows/shrinks per step
    window.addEventListener('message', (e) => {
      const d = e.data
      if (!d || typeof d !== 'object' || d.source !== 'ai-central-quiz') return
      if (d.embedId && d.embedId !== embedId) return
      if (d.type === 'form_resized' && d.size && !fullscreen) {
        wrap.style.height = (d.size + 24) + 'px'
      }
      if (d.type === 'form_submitted') {
        try { window.dispatchEvent(new CustomEvent('ac-quiz-submitted', { detail: d })) } catch (_) {}
      }
    }, false)
  }

  // ── Boot ───────────────────────────────────────────────────────
  function init(el) {
    if (el.dataset.acInitialized) return
    el.dataset.acInitialized = '1'
    ensureStyles()
    const cfg = getConfig(el)
    if (cfg.embedType === 'popup' || cfg.embedType === 'slider') {
      makeButton(el, cfg, () => openPopupLike(el, cfg))
    } else if (cfg.embedType === 'fullscreen') {
      openStandard(el, cfg, true)
    } else {
      openStandard(el, cfg, false)
    }
  }

  function bootAll() {
    const targets = document.querySelectorAll('[data-ac-survey-id]')
    targets.forEach(el => { if (el instanceof HTMLElement) init(el) })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootAll)
  } else {
    bootAll()
  }
})()
