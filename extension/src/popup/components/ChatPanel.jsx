import { useState, useEffect, useRef } from 'react'
import { MSG } from '../../shared/constants'

export default function ChatPanel({ messages = [], onSendMessage, username }) {
  const [text, setText] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim()) return
    onSendMessage(text.trim())
    setText('')
  }

  return (
    <div className="flex flex-col h-[280px] bg-black/20 rounded-xl border border-white/5 overflow-hidden">
      {/* Messages area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-20 italic text-[10px]">
            <p>No messages yet</p>
            <p>Say hello to the squad! 👋</p>
          </div>
        ) : (
          messages.map((m, i) => {
            const isMe = m.user_name === username
            return (
              <div key={i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[85%] px-3 py-1.5 rounded-2xl text-[11px] leading-relaxed shadow-sm ${
                  isMe 
                    ? 'bg-violet-600/60 text-white rounded-tr-none border border-violet-500/30' 
                    : 'bg-white/10 text-white/90 rounded-tl-none border border-white/5'
                }`}>
                  {!isMe && <p className="text-[9px] font-bold text-violet-400 mb-0.5">{m.user_name}</p>}
                  <p className="break-words">{m.message}</p>
                </div>
                <span className="text-[8px] text-white/20 mt-1 px-1">
                  {new Date(m.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )
          })
        )}
      </div>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="p-2 bg-white/5 border-t border-white/5 flex gap-2">
        <input
          className="flex-1 bg-black/40 border border-white/10 rounded-full h-8 px-3 text-xs text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50 transition-all"
          placeholder="Type a message..."
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <button 
          type="submit"
          className="w-8 h-8 flex items-center justify-center bg-violet-600 hover:bg-violet-500 text-white rounded-full transition-all active:scale-90"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </form>
    </div>
  )
}
