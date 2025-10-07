import { useState, useEffect } from "react"

const TOKEN_KEY = "cp_token"

export function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token)
}
export function getToken() {
    return localStorage.getItem(TOKEN_KEY) || null
}
export function clearToken() {
    localStorage.removeItem(TOKEN_KEY)
}

function base64UrlDecode(str) {
    const pad = "=".repeat((4 - (str.length % 4)) % 4)
    const s = (str + pad).replace(/-/g, "+").replace(/_/g, "/")
    try {
        return decodeURIComponent(
            atob(s)
                .split("")
                .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                .join("")
        )
    } catch {
        return null
    }
}

export function getUserFromToken() {
    const token = getToken()
    if (!token) return null
    const [, payload] = token.split(".")
    if (!payload) return null
    const json = base64UrlDecode(payload)
    if (!json) return null
    try {
        const data = JSON.parse(json)
        return {
            id: data.sub ? Number(data.sub) : null,
            email: data.email ?? null,
            role: data.role ?? null,
            doctor_id: data.doctor_id != null ? Number(data.doctor_id) : null,
            name: data.name ?? null,   // 👈 ahora leemos name
            exp: data.exp ?? null,
        }
    } catch {
        return null
    }
}

export function isLoggedIn() {
    const u = getUserFromToken()
    if (!u) return false
    if (!u.exp) return true
    const now = Math.floor(Date.now() / 1000)
    return u.exp > now
}

export function useAuth() {
    const [user, setUser] = useState(getUserFromToken())

    useEffect(() => {
        // revisar cambios en localStorage cada vez que cambie el token
        const sync = () => setUser(getUserFromToken())
        window.addEventListener("storage", sync)
        return () => window.removeEventListener("storage", sync)
    }, [])

    return { user, isLoggedIn: isLoggedIn() }
}