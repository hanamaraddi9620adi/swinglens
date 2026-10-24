import { createContext, useContext, useEffect, useState } from 'react'
import { api, clearToken, getToken, setToken } from './api'
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)
  useEffect(() => {
    let active = true
    const expired = () => setUser(null)
    window.addEventListener('swinglens:unauthorized', expired)
    if (!getToken()) setChecking(false)
    else api.me().then(value => { if (active) setUser(value) }).catch(() => {}).finally(() => { if (active) setChecking(false) })
    return () => { active = false; window.removeEventListener('swinglens:unauthorized', expired) }
  }, [])
  const authenticate = async operation => {
    const data = await operation()
    setToken(data.access_token)
    try { setUser(await api.me()) } catch (err) { clearToken(); throw err }
  }
  const login = (email, password) => authenticate(() => api.login(email, password))
  const register = (username, email, password) => authenticate(() => api.register(username, email, password))
  const logout = () => { clearToken(); setUser(null) }
  return <AuthContext.Provider value={{ user, checking, login, register, logout }}>{children}</AuthContext.Provider>
}
export const useAuth = () => useContext(AuthContext)
