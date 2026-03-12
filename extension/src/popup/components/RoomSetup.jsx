import { useState } from 'react'

export default function RoomSetup({ onCreateRoom, onJoinRoom, wsStatus, myRooms = [] }) {
  const [joinCode, setJoinCode] = useState('')
  const [loading,  setLoading]  = useState(null) // 'create' | 'join' | 'saved'
  const [activeSaved, setActiveSaved] = useState(null)

  const isLoading = !!loading

  async function handleCreate() {
    setLoading('create')
    try { await onCreateRoom() }
    catch { /* Handled by App Toast */ }
    finally   { setLoading(null) }
  }

  async function handleJoin(code) {
    const target = code || joinCode
    if (!target.trim()) return
    setLoading(code ? 'saved' : 'join')
    if (code) setActiveSaved(code)
    try { await onJoinRoom(target) }
    catch { /* Handled by App Toast */ }
    finally   { setLoading(null); setActiveSaved(null) }
  }

  return (
    <div className="flex flex-col gap-4 animate-slide-up">

      {/* Hero */}
      <div className="text-center py-2">
        <div className="w-12 h-12 mx-auto mb-2 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center shadow-lg shadow-violet-900/40">
          <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7L8 5z"/>
          </svg>
        </div>
        <h1 className="text-lg font-bold bg-gradient-to-r from-violet-300 to-blue-300 bg-clip-text text-transparent">
          Watch Together
        </h1>
      </div>

      {/* Saved Rooms */}
      {myRooms.length > 0 && (
        <div className="glass p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">Your Rooms</p>
          <div className="flex flex-wrap gap-2">
            {myRooms.map(id => (
              <button
                key={id}
                onClick={() => handleJoin(id)}
                disabled={isLoading}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all border ${
                  activeSaved === id 
                    ? 'bg-violet-600/50 border-violet-400 text-white' 
                    : 'bg-white/5 border-white/10 text-violet-300 hover:bg-white/10 hover:border-violet-500/50'
                }`}
              >
                {activeSaved === id ? '...' : id}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create */}
      <div className="glass p-4 flex flex-col gap-3">
        <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">Start New</p>
        <button
          className="btn-primary py-2.5"
          onClick={handleCreate}
          disabled={isLoading}
        >
          {loading === 'create' ? <Spinner /> : (
            <>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 11H13V5a1 1 0 0 0-2 0v6H5a1 1 0 0 0 0 2h6v6a1 1 0 0 0 2 0v-6h6a1 1 0 0 0 0-2z"/>
              </svg>
              Create New Room
            </>
          )}
        </button>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-2 text-white/20 text-[10px]">
        <div className="flex-1 h-px bg-white/10" />
        or join via code
        <div className="flex-1 h-px bg-white/10" />
      </div>

      {/* Join */}
      <div className="glass p-4 flex flex-col gap-3">
        <input
          className="input"
          placeholder="Room code (e.g. a1b2c3d4)"
          value={joinCode}
          onChange={e => setJoinCode(e.target.value.toLowerCase())}
          onKeyDown={e => e.key === 'Enter' && handleJoin()}
          maxLength={16}
        />
        <button
          className="btn-ghost border-violet-500/30 text-violet-300 hover:text-violet-200 hover:bg-violet-900/20 py-2"
          onClick={() => handleJoin()}
          disabled={isLoading}
        >
          {loading === 'join' ? <Spinner /> : <>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 3L4 12l9 9V15h8V9h-8V3z"/>
            </svg>
            Join Room
          </>}
        </button>
      </div>

      {/* Connecting hint */}
      {wsStatus === 'connecting' && (
        <div className="text-center text-amber-400 text-xs animate-pulse">
          Connecting to server…
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity=".25"/>
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity=".25"/>
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
    </svg>
  )
}
