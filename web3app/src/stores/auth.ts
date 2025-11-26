import { defineStore } from 'pinia'

const STORAGE_KEY = 'sessionToken_v2'  //  NUEVA CLAVE

export const useAuthStore = defineStore('auth', {
  state: () => ({
    email: '' as string,
    sessionToken: '' as string,
    emailVerified: false as boolean,
    user: null as null | { email: string; walletAddress?: string },
    apiBase: (import.meta as any)?.env?.VITE_API_BASE || 'http://localhost:5000',
  }),

  getters: {
    isLoggedIn: (s) => !!s.sessionToken,
  },

  actions: {
    setEmail(email: string) {
      this.email = email
    },

    setSessionToken(token: string) {
      this.sessionToken = token
      localStorage.setItem(STORAGE_KEY, token)
      this.emailVerified = true // tras OTP ok, ya estás verificado
    },

    clearSession() {
      this.sessionToken = ''
      this.emailVerified = false
      this.user = null
      localStorage.removeItem(STORAGE_KEY)
    },

    loadSessionFromStorage() {
      const token = localStorage.getItem(STORAGE_KEY)
      if (token) this.sessionToken = token
    },

    setUser(user: { email: string; walletAddress?: string }) {
      this.user = user
    },

    // Validar token al arrancar (sesión 30 min)
    async validateSession() {
      this.loadSessionFromStorage()

      if (!this.sessionToken) {
        this.emailVerified = false
        return false
      }
      try {
        const res = await fetch(`${this.apiBase}/api/session/validate`, {
          headers: { Authorization: `Bearer ${this.sessionToken}` },
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          this.clearSession()
          return false
        }
        // Token OK -> seguimos verificados
        this.email = json.correo || this.email
        this.emailVerified = true
        return true
      } catch {
        this.clearSession()
        return false
      }
    },
  },
})
