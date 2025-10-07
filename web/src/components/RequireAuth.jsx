// src/components/RequireAuth.jsx
import { Navigate, Outlet, useLocation } from "react-router-dom"
import { isLoggedIn } from "../lib/auth"

function RequireAuthComponent() {
    const location = useLocation()

    if (!isLoggedIn()) {
        // Redirige a /login guardando desde dónde venías
        return <Navigate to="/login" state={{ from: location }} replace />
    }

    return <Outlet />
}

export default RequireAuthComponent
export { RequireAuthComponent as RequireAuth }
