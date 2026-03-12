import { MSG } from '../../shared/constants'

export default function ControlPanel({ isHost, isCtrl, roomState, userId, sendMsg }) {
  const locked = roomState?.isLocked ?? false

  function toggleLock() {
    sendMsg(MSG.SET_PERMISSION, { user_id: userId, is_locked: !locked })
  }

  return (
    <div className="flex flex-col gap-3">

      {/* Who's in control */}
      <div className="glass p-3">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Sound Master</p>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-xs font-bold">
            {(roomState?.controllerId || '??').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-white/80">{roomState?.controllerId || '—'}</p>
            <p className="text-xs text-white/30">Controls playback for the room</p>
          </div>
          {isCtrl && (
            <span className="ml-auto badge bg-violet-900/60 text-violet-300 border border-violet-500/20">
              🎵 You
            </span>
          )}
        </div>
      </div>

      {/* Host controls */}
      {isHost && (
        <div className="glass p-3 flex flex-col gap-3">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">
            Host Controls 👑
          </p>

          {/* Lock / Unlock */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/80">
                {locked ? '🔒 Room Locked' : '🔓 All Can Control'}
              </p>
              <p className="text-xs text-white/30">
                {locked
                  ? 'Only Sound Master can sync'
                  : 'Everyone can play / pause'}
              </p>
            </div>
            <button
              onClick={toggleLock}
              className={`relative w-11 h-6 rounded-full transition-all duration-200 flex-shrink-0 ${
                locked ? 'bg-violet-600' : 'bg-white/10'
              }`}
              role="switch"
              aria-checked={locked}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                locked ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </div>
      )}

      {/* Quick Info */}
      <div className="glass p-3">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Room Info</p>
        <div className="grid grid-cols-2 gap-2 text-center">
          <Stat label="Members" value={roomState?.members?.length ?? 0} />
          <Stat label="In Queue" value={roomState?.playlist?.length ?? 0} />
        </div>
      </div>

      {/* Desync recovery */}
      <button
        className="btn-ghost text-white/40 hover:text-white/70 text-xs"
        onClick={() =>
          sendMsg(MSG.GET_STATE).then(() => {
            // Background will respond with fresh state push
          })
        }
      >
        🔄 Force Re-sync
      </button>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="bg-white/5 rounded-xl py-2 px-3">
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-xs text-white/30">{label}</p>
    </div>
  )
}
