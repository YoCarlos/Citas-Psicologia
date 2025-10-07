// src/components/RequireProfileComplete.jsx
import React from "react"
import { Navigate, useLocation } from "react-router-dom"
import { apiGet } from "../lib/api"
import { isProfileComplete } from "../lib/profileGuard"

export default function RequireProfileComplete({ children }) {
    const location = useLocation()
    const [status, setStatus] = React.useState({ loading: true, ok: false })

    React.useEffect(() => {
        let alive = true
        async function check() {
            try {
                const res = await apiGet(`/patients/me?_=${Date.now()}`)
                const ok = isProfileComplete(res)
                if (!alive) return
                setStatus({ loading: false, ok })
            } catch (err) {
                // 404 => no perfil aún
                if (!alive) return
                setStatus({ loading: false, ok: false })
            }
        }
        check()
        return () => { alive = false }
    }, [location.key])

    if (status.loading) {
        return <div className="p-4 text-sm text-gray-500">Verificando tu perfil…</div>
    }

    if (!status.ok) {
        return (
            <Navigate
                to="/paciente/perfil"
                replace
                state={{ msg: "Por favor, completa tu perfil antes de continuar." }}
            />
        )
    }

    return children
}
