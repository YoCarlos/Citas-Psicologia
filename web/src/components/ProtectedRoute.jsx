import { Navigate, Outlet } from "react-router-dom"
import { isLoggedIn, getUserFromToken } from "../lib/auth"

export default function ProtectedRoute({ requireRole }) {
    if (!isLoggedIn()) return <Navigate to="/login" replace />

    const user = getUserFromToken()
    if (requireRole && user?.role !== requireRole) {
        // si tiene sesión pero rol distinto, redirige a su panel
        return <Navigate to={user?.role === "doctor" ? "/psico" : "/paciente"} replace />
    }

    return <Outlet />
}
