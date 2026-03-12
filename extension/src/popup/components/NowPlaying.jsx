import { useEffect, useState } from 'react'
import { MSG, ACTION } from '../../shared/constants'

export default function NowPlaying({ videoId, isCtrl, sendMsg }) {
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [title,    setTitle]    = useState('')
  const [isPaused, setIsPaused] = useState(false)

  // Poll for status from the real YouTube tab
  useEffect(() => {
    if (!videoId) return
    let timer

    async function pollVideo() {
      try {
        const [tab] = await chrome.tabs.query({ url: "*://*.youtube.com/*" })
        if (!tab) return

        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const v = document.querySelector('video')
            return v ? { currentTime: v.currentTime, duration: v.duration, paused: v.paused } : null
          },
        })

        if (result?.result) {
          const { currentTime, duration: dur, paused } = result.result
          setProgress(currentTime)
          setDuration(dur || 0)
          setIsPaused(paused)
        }
      } catch { /* no-op */ }
      timer = setTimeout(pollVideo, 1000)
    }

    pollVideo()
    return () => clearTimeout(timer)
  }, [videoId])

  function handleTogglePlay() {
    if (!isCtrl) return
    const action = isPaused ? ACTION.PLAY : ACTION.PAUSE
    sendMsg(MSG.REMOTE_CONTROL, { action })
  }

  // Fetch title
  useEffect(() => {
    if (!videoId) return
    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
      .then(r => r.json())
      .then(d => setTitle(d.title))
      .catch(() => setTitle(videoId))
  }, [videoId])

  const pct  = duration > 0 ? (progress / duration) * 100 : 0
  const fmt  = (s) => {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="glass p-3 relative overflow-hidden group">
      <div className="flex items-center gap-3 mb-3">
        {/* Thumbnail with Play/Pause overlay */}
        <div className="relative flex-shrink-0">
          <img
            src={`https://i.ytimg.com/vi/${videoId}/default.jpg`}
            alt={title}
            className="w-20 h-14 object-cover rounded-lg shadow-md group-hover:brightness-50 transition-all"
          />
          {isCtrl && (
             <button 
               onClick={handleTogglePlay}
               className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20"
             >
               <span className="text-xl text-white shadow-lg">{isPaused ? '▶' : '⏸'}</span>
             </button>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">Now Syncing 📡</p>
            {isPaused && <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-500 rounded font-bold animate-pulse">PAUSED</span>}
          </div>
          <p className="text-sm font-semibold text-white/90 truncate leading-snug pr-2">{title || videoId}</p>
          
          <div className="flex items-center gap-2 mt-1">
            <button 
              onClick={handleTogglePlay}
              disabled={!isCtrl}
              className={`text-[11px] font-bold px-2 py-0.5 rounded transition-all ${
                !isCtrl ? 'bg-white/5 text-white/20' : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
              }`}
            >
              {isPaused ? 'RESUME ALL' : 'PAUSE ALL'}
            </button>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-1">
        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full transition-all duration-1000"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-medium font-mono text-white/30">
          <span>{fmt(progress)}</span>
          <span>{duration > 0 ? fmt(duration) : '--:--'}</span>
        </div>
      </div>
    </div>
  )
}
