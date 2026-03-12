import { VERSION, MSG } from '../../shared/constants'
import { useState } from 'react'

export default function AboutPanel({ onToast, newVersion }) {
  const [checking, setChecking] = useState(false)

  function handleCheck() {
    setChecking(true)
    chrome.runtime.sendMessage({ type: MSG.CHECK_UPDATE }, () => {
      setTimeout(() => {
        setChecking(false)
        if (!newVersion) {
          onToast('You are on the latest version! ✨', 'success')
        }
      }, 1000)
    })
  }

  return (
    <div className="flex flex-col gap-5 animate-slide-up p-1">
      {/* Brand Header */}
      <div className="flex flex-col items-center py-4 bg-gradient-to-b from-white/5 to-transparent rounded-2xl border border-white/5">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center shadow-2xl shadow-violet-900/40 mb-3">
          <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7L8 5z"/>
          </svg>
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">SyncCast</h1>
        <p className="text-xs text-white/40 font-mono tracking-widest mt-1">PRO EDITION v{VERSION}</p>
      </div>

      {/* Info Sections */}
      <div className="space-y-3">
        <section className="glass p-3 border-white/5 bg-white/[0.02]">
          <h2 className="text-[10px] font-bold text-violet-400 uppercase tracking-widest mb-2">What's New</h2>
          <ul className="text-xs text-white/60 space-y-1.5 list-disc list-inside">
            <li>Mini Chat integration</li>
            <li>Auto-Play Next in playlist</li>
            <li>Real-time Presence updates</li>
            <li>Premium glassmorphism UI</li>
          </ul>
        </section>

        <section className="glass p-4 border-white/5 bg-white/[0.02] flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Update Center</h2>
            <p className="text-[11px] text-white/40">
              {newVersion ? `Server suggests v${newVersion.version}` : 'Up to date via local server'}
            </p>
          </div>
          
          {newVersion ? (
            <button 
              onClick={() => window.open(newVersion.updateUrl, '_blank')}
              className="btn-primary px-4 py-1.5 text-xs shadow-lg shadow-violet-900/40 animate-pulse"
            >
              Get Latest ZIP
            </button>
          ) : (
            <button 
              onClick={handleCheck}
              disabled={checking}
              className={`text-xs px-4 py-1.5 rounded-lg border border-white/10 transition-all ${
                checking ? 'bg-white/5 text-white/20' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              {checking ? 'Checking...' : 'Check for Updates'}
            </button>
          )}
        </section>
      </div>

      {/* Footer Branding */}
      <div className="text-center py-2 opacity-30 group hover:opacity-60 transition-opacity">
        <p className="text-[10px] text-white font-medium">Brought to you by</p>
        <p className="text-[13px] font-bold bg-gradient-to-r from-violet-300 to-blue-300 bg-clip-text text-transparent">
          BANG APING & TEAM
        </p>
      </div>
    </div>
  )
}
