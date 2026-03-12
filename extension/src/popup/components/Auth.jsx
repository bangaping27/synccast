import { useState } from 'react'

export default function Auth({ onLogin, onRegister }) {
  const [isLogin, setIsLogin] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!username || !password) return
    setLoading(true)
    try {
      if (isLogin) {
        await onLogin(username, password)
      } else {
        await onRegister(username, password)
      }
    } catch {
      // Parent handles toast
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 animate-slide-up">
      <div className="text-center py-4">
        <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center shadow-xl shadow-violet-900/40">
           <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
          </svg>
        </div>
        <h1 className="text-xl font-bold bg-gradient-to-r from-violet-300 to-blue-300 bg-clip-text text-transparent">
          {isLogin ? 'Welcome Back' : 'Create Account'}
        </h1>
        <p className="text-white/40 text-sm mt-1">
          {isLogin ? 'Sign in to access your rooms' : 'Register to keep your rooms forever'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="glass p-4 flex flex-col gap-3">
        <input
          className="input"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        <button
          className="btn-primary w-full"
          type="submit"
          disabled={loading}
        >
          {loading ? 'Processing...' : (isLogin ? 'Login' : 'Register')}
        </button>
      </form>

      <div className="text-center">
        <button
          onClick={() => setIsLogin(!isLogin)}
          className="text-white/40 text-xs hover:text-violet-400/80 transition-colors"
        >
          {isLogin ? "Don't have an account? Register" : "Already have an account? Login"}
        </button>
      </div>
    </div>
  )
}
