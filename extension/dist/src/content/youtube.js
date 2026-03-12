/**
 * SyncCast Content Script — YouTube Injector
 *
 * Responsibilities:
 *  1. Monitor <video> element for play / pause / seek events
 *  2. Detect YouTube ads and flag them so sync is suppressed
 *  3. Receive EXECUTE_ACTION from Background → control the video
 *  4. Inject a "Add to Queue" button via Shadow DOM (safe, no CSS collision)
 */

import { MSG, ACTION } from '../shared/constants.js'

// ─── Constants ────────────────────────────────────────────────────────────────
const DEBOUNCE_MS = 500       // avoid seek spam
const SEEK_EPSILON = 2        // seconds tolerance for seek events

// ─── State ────────────────────────────────────────────────────────────────────
let video        = null
let lastTime     = 0
let debounceTimer = null
let isListening  = false
let overlayRoot  = null

// ─── Bootstrap ───────────────────────────────────────────────────────────────
init()

function init() {
  log('Content script loaded')
  waitForVideo()
  injectOverlay()
  listenFromBackground()
}

// ─── Video discovery ─────────────────────────────────────────────────────────
function waitForVideo() {
  const observer = new MutationObserver(() => {
    const v = document.querySelector('video')
    if (v && v !== video) {
      video = v
      attachVideoListeners()
      log('🎬 Video element found')
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })

  // Also check immediately
  const v = document.querySelector('video')
  if (v) { video = v; attachVideoListeners() }
}

// ─── Video event listeners ────────────────────────────────────────────────────
function attachVideoListeners() {
  if (isListening) return
  isListening = true

  video.addEventListener('play',   () => onVideoEvent(ACTION.PLAY))
  video.addEventListener('pause',  () => onVideoEvent(ACTION.PAUSE))
  video.addEventListener('seeked', () => {
    if (Math.abs(video.currentTime - lastTime) > SEEK_EPSILON) {
      onVideoEvent(ACTION.SEEK)
    }
  })
  video.addEventListener('timeupdate', () => { lastTime = video.currentTime })
}

function onVideoEvent(action) {
  // Cek apakah extension masih valid
  if (!chrome.runtime?.id) return

  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    const videoId = getYouTubeVideoId()
    const isAd    = isYouTubeAd()

    try {
      chrome.runtime.sendMessage({
        type: MSG.VIDEO_EVENT,
        payload: {
          action,
          currentTime: video?.currentTime ?? 0,
          videoId,
          isAd,
        },
      }).catch(() => { /* Silent fail */ })
    } catch (e) {
      if (e.message.includes('context invalidated')) {
        log('Extension updated, please refresh the page.')
      }
    }
  }, DEBOUNCE_MS)
}

// ─── Receive play commands from Background ────────────────────────────────────
function listenFromBackground() {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === MSG.EXECUTE_ACTION) {
      executeAction(msg.payload)
    } else if (msg.type === MSG.REMOTE_CONTROL) {
      executeRemoteControl(msg.payload)
    }
  })
}

function executeRemoteControl({ action }) {
  if (!video) return
  if (action === ACTION.PLAY  && video.paused)  video.play().catch(() => {})
  if (action === ACTION.PAUSE && !video.paused) video.pause()
}

function executeAction({ action, currentTime, videoId }) {
  if (!video) { log('No video element – cannot execute', action); return }

  // If a different video is requested, navigate
  const currentVid = getYouTubeVideoId()
  if (videoId && currentVid && videoId !== currentVid) {
    window.location.href = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(currentTime)}s`
    return
  }

  // Sync time if necessary (> 2s off)
  if (Math.abs(video.currentTime - currentTime) > SEEK_EPSILON) {
    video.currentTime = currentTime
  }

  if (action === ACTION.PLAY  && video.paused)  video.play().catch(() => {})
  if (action === ACTION.PAUSE && !video.paused) video.pause()
  if (action === ACTION.SEEK)                   video.currentTime = currentTime

  log(`▶ Executed ${action} @ ${currentTime.toFixed(1)}s`)
  flashSyncIndicator()
}

// ─── Ad detection ─────────────────────────────────────────────────────────────
function isYouTubeAd() {
  // YouTube ad overlay class names (as of 2025)
  return !!(
    document.querySelector('.ad-showing') ||
    document.querySelector('.ytp-ad-player-overlay') ||
    document.querySelector('.ytp-ad-text')
  )
}

// ─── YouTube video ID helper ───────────────────────────────────────────────────
function getYouTubeVideoId() {
  try {
    const params = new URLSearchParams(window.location.search)
    return params.get('v') || null
  } catch {
    return null
  }
}

// ─── Shadow DOM Overlay ────────────────────────────────────────────────────────
function injectOverlay() {
  // Watch for YouTube's right-menu to appear then insert our button
  const observer = new MutationObserver(() => {
    tryInjectQueueButton()
  })
  observer.observe(document.body, { childList: true, subtree: true })
  tryInjectQueueButton()
}

function tryInjectQueueButton() {
  // Target specifically the action bar under the main video player
  const actionsBar = document.querySelector('ytd-watch-metadata #top-level-buttons-computed') || document.querySelector('ytd-watch-metadata ytd-menu-renderer')
  if (!actionsBar) return

  // Check if our button is already injected in the right place
  const existingBtn = document.getElementById('synccast-btn')
  if (existingBtn) {
    if (actionsBar.contains(existingBtn)) return
    // If it's somewhere else (e.g. an old video instance), remove it
    existingBtn.remove()
  }

  // Create host element for Shadow DOM
  const host = document.createElement('div')
  host.id = 'synccast-btn'
  // Adjusted margins for better appearance
  host.style.cssText = 'display:inline-flex;align-items:center;margin-right:8px;vertical-align:middle'

  const shadow = host.attachShadow({ mode: 'open' })

  shadow.innerHTML = `
    <style>
      button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        border-radius: 9999px;
        border: none;
        cursor: pointer;
        font-family: 'Roboto', sans-serif;
        font-size: 14px;
        font-weight: 500;
        background: linear-gradient(135deg, #7c3aed, #3b82f6);
        color: white;
        transition: opacity .15s, transform .15s;
        white-space: nowrap;
        height: 36px; /* Match YouTube menu buttons height */
      }
      button:hover  { opacity: .88; transform: scale(1.03); }
      button:active { transform: scale(.97); }
      svg { width:16px; height:16px; fill:white; flex-shrink:0; }

      .toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(124,58,237,.95);
        color:#fff;
        padding: 8px 20px;
        border-radius: 9999px;
        font-family:'Roboto',sans-serif;
        font-size:14px;
        pointer-events:none;
        opacity:0;
        transition: opacity .3s;
        z-index: 99999;
      }
      .toast.show { opacity:1; }
    </style>

    <button id="add-btn" title="Add to Stream">
      <svg viewBox="0 0 24 24"><path d="M19 11H13V5a1 1 0 0 0-2 0v6H5a1 1 0 0 0 0 2h6v6a1 1 0 0 0 2 0v-6h6a1 1 0 0 0 0-2z"/></svg>
      Add to Stream
    </button>
    <div class="toast" id="toast">Added to Stream! ✅</div>
  `

  shadow.querySelector('#add-btn').addEventListener('click', () => {
    const vid   = getYouTubeVideoId()
    const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')
    const title = titleEl ? titleEl.textContent.trim() : document.title.replace(' - YouTube', '').trim()

    // Ambil elemen durasi
    let durationSeconds = 0;
    const durationEl = document.querySelector('.ytp-time-duration');
    if (durationEl) {
      const parts = durationEl.textContent.trim().split(':').reverse();
      // parts[0] is seconds, parts[1] is minutes, parts[2] is hours (if any)
      for (let i = 0; i < parts.length; i++) {
        durationSeconds += parseInt(parts[i], 10) * Math.pow(60, i);
      }
    }

    if (!vid) { showToast(shadow, '⚠ Open a video first!'); return }

    chrome.runtime.sendMessage({
      type: MSG.ADD_QUEUE,
      payload: { video_id: vid, title, duration: durationSeconds },
    }).catch(() => {})

    showToast(shadow, 'Added to Stream! ✅')
  })

  actionsBar.prepend(host)

  // Persist ref & update on navigation (YouTube is SPA)
  overlayRoot = host
}

function showToast(shadow, message) {
  const toast = shadow.querySelector('#toast')
  if (!toast) return
  toast.textContent = message
  toast.classList.add('show')
  setTimeout(() => toast.classList.remove('show'), 2500)
}

// ─── Visual sync flash indicator ──────────────────────────────────────────────
let flashEl = null

function flashSyncIndicator() {
  if (!flashEl) {
    flashEl = document.createElement('div')
    flashEl.style.cssText = `
      position:fixed;bottom:80px;right:24px;z-index:100000;
      background:linear-gradient(135deg,#7c3aed,#3b82f6);
      color:#fff;padding:6px 14px;border-radius:9999px;
      font-family:'Roboto',sans-serif;font-size:13px;font-weight:500;
      pointer-events:none;opacity:0;transition:opacity .3s;
    `
    flashEl.textContent = '🔄 Synced'
    document.body.appendChild(flashEl)
  }
  flashEl.style.opacity = '1'
  clearTimeout(flashEl._timer)
  flashEl._timer = setTimeout(() => { flashEl.style.opacity = '0' }, 1500)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function log(...args) {
  console.log('[SyncCast CS]', ...args)
}
