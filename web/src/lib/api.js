import { getToken } from "./auth"

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000"

function authHeaders() {
    const token = getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function apiPost(path, data) {
    const res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
        credentials: "include",
    })
    const isJson = res.headers.get("content-type")?.includes("application/json")
    const payload = isJson ? await res.json() : null

    if (!res.ok) {
        const message = payload?.detail || payload?.message || `Error ${res.status}`
        throw new Error(message)
    }
    return payload
}

export async function apiGet(path) {
    const res = await fetch(`${API_URL}${path}`, {
        headers: { ...authHeaders() },
        credentials: "include",
    })
    const isJson = res.headers.get("content-type")?.includes("application/json")
    const payload = isJson ? await res.json() : null

    if (!res.ok) {
        const message = payload?.detail || payload?.message || `Error ${res.status}`
        throw new Error(message)
    }
    return payload
}

export async function apiPut(path, data) {
    const res = await fetch(`${API_URL}${path}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
        credentials: "include",
    })
    const isJson = res.headers.get("content-type")?.includes("application/json")
    const payload = isJson ? await res.json() : null

    if (!res.ok) {
        const message = payload?.detail || payload?.message || `Error ${res.status}`
        throw new Error(message)
    }
    return payload
}

export async function apiDelete(path) {
    const res = await fetch(`${API_URL}${path}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
        credentials: "include",
    })

    // FastAPI suele responder 204 No Content en deletes
    if (res.status === 204) return null

    const isJson = res.headers.get("content-type")?.includes("application/json")
    const payload = isJson ? await res.json() : null

    if (!res.ok) {
        const message = payload?.detail || payload?.message || `Error ${res.status}`
        throw new Error(message)
    }
    return payload
}
