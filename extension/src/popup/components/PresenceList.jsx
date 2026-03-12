export default function PresenceList({ members, hostId, controllerId, myId, isHost, onTransfer }) {
  if (!members || members.length === 0) {
    return (
      <div className="text-center text-white/30 text-sm py-8">
        No members yet…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-1">
        Online — {members.length}
      </p>
      {members.map(uid => {
        const isMe        = uid === myId
        const isThisHost  = uid === hostId
        const isThisCtrl  = uid === controllerId

        return (
          <div
            key={uid}
            className="glass px-3 py-2.5 flex items-center justify-between group hover:border-violet-500/30 transition-all"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Avatar */}
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {uid.slice(0, 2).toUpperCase()}
              </div>

              {/* Name */}
              <span className="text-sm font-medium truncate text-white/80">
                {uid}
                {isMe && <span className="text-white/30 text-xs ml-1">(you)</span>}
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {isThisHost && (
                <span className="badge bg-amber-900/60 text-amber-300 border border-amber-500/20">
                  👑 Host
                </span>
              )}
              {isThisCtrl && (
                <span className="badge bg-violet-900/60 text-violet-300 border border-violet-500/20">
                  🎵 Sound
                </span>
              )}

              {/* Transfer control button (host only, not to themselves) */}
              {isHost && !isMe && (
                <button
                  onClick={() => onTransfer(uid)}
                  title="Give control"
                  className="opacity-0 group-hover:opacity-100 ml-1 text-xs text-violet-400 hover:text-violet-200 transition-all"
                >
                  Give 🎵
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
