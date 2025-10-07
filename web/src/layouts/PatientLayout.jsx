// src/layouts/PatientLayout.jsx
import React from "react"
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import { Calendar, ClipboardList, Menu, Settings, LogOut, User as UserIcon, AlertTriangle } from "lucide-react"
import SideDrawer from "../components/SideDrawer"
import { getUserFromToken, clearToken } from "../lib/auth"
import { apiGet } from "../lib/api"
import { isProfileComplete } from "../lib/profileGuard"

const navItemBase =
    "flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm font-medium transition-colors"
const navActive = "bg-blue-100 text-blue-800 font-semibold"
const navInactive = "text-gray-700 hover:bg-blue-50 hover:text-blue-700"

function initialsFrom(nameOrEmail) {
    if (!nameOrEmail) return "P"
    const name = nameOrEmail.trim()
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name[0].toUpperCase()
}

function PatientSidebar({ profileComplete }) {
    return (
        <div className="h-full flex flex-col w-[240px]">
            <div className="p-4 border-b">
                <div className="font-bold text-emerald-700">Salud Mental</div>
                <div className="text-xs text-gray-500">Panel del paciente</div>
            </div>

            <nav className="flex-1 p-3 space-y-2">
                {!profileComplete ? (
                    <NavLink
                        to="/paciente/perfil"
                        className={({ isActive }) => `${navItemBase} ${isActive ? navActive : navInactive}`}
                    >
                        <UserIcon className="h-4 w-4" />
                        <span>Mi perfil</span>
                    </NavLink>
                ) : (
                    <>
                        <NavLink
                            end
                            to="/paciente"
                            className={({ isActive }) => `${navItemBase} ${isActive ? navActive : navInactive}`}
                        >
                            <Calendar className="h-4 w-4" />
                            <span>Agendar</span>
                        </NavLink>

                        <NavLink
                            to="/paciente/citas"
                            className={({ isActive }) => `${navItemBase} ${isActive ? navActive : navInactive}`}
                        >
                            <ClipboardList className="h-4 w-4" />
                            <span>Mis citas</span>
                        </NavLink>

                        <NavLink
                            to="/paciente/perfil"
                            className={({ isActive }) => `${navItemBase} ${isActive ? navActive : navInactive}`}
                        >
                            <UserIcon className="h-4 w-4" />
                            <span>Mi perfil</span>
                        </NavLink>

                        <NavLink
                            to="/paciente/configuracion"
                            className={({ isActive }) => `${navItemBase} ${isActive ? navActive : navInactive}`}
                        >
                            <Settings className="h-4 w-4" />
                            <span>Configuración</span>
                        </NavLink>
                    </>
                )}
            </nav>

            <div className="p-3 border-t text-sm text-gray-500" />
        </div>
    )
}

export default function PatientLayout() {
    const [open, setOpen] = React.useState(false)
    const [profileComplete, setProfileComplete] = React.useState(false)
    const [bannerMsg, setBannerMsg] = React.useState("")
    const location = useLocation()
    const navigate = useNavigate()

    React.useEffect(() => setOpen(false), [location.pathname])

    const user = getUserFromToken()
    const displayName = user?.name || user?.email || "Paciente"
    const initials = initialsFrom(displayName)

    // Función reutilizable para cargar estado del perfil
    const load = React.useCallback(async () => {
        try {
            const res = await apiGet(`/patients/me?_=${Date.now()}`)
            const ok = isProfileComplete(res)
            setProfileComplete(ok)
            setBannerMsg(ok ? "" : "Antes de continuar, completa tu perfil (residencia, contacto de emergencia, WhatsApp y motivo).")
        } catch {
            setProfileComplete(false)
            setBannerMsg("Antes de continuar, completa tu perfil (residencia, contacto de emergencia, WhatsApp y motivo).")
        }
    }, [])

    // Cargar al montar y cuando cambia la navegación
    React.useEffect(() => {
        let alive = true
            ; (async () => {
                await load()
                if (!alive) return
            })()
        return () => { alive = false }
    }, [load, location.key])

    // 🔔 Escuchar cambios desde Profile.jsx
    React.useEffect(() => {
        function onProfileUpdated() {
            load()
        }
        window.addEventListener("profile-updated", onProfileUpdated)
        return () => window.removeEventListener("profile-updated", onProfileUpdated)
    }, [load])

    function handleLogout() {
        clearToken()
        navigate("/login", { replace: true })
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Topbar */}
            <header className="bg-white border-b sticky top-0 z-30">
                <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            className="md:hidden p-2 rounded-lg border hover:bg-gray-50"
                            onClick={() => setOpen(true)}
                            aria-label="Abrir menú"
                        >
                            <Menu className="h-5 w-5" />
                        </button>
                        <div className="font-semibold">Bienvenido/a</div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <div className="text-sm font-semibold">{displayName}</div>
                            <div className="text-xs text-gray-500">Zona horaria: América/Guayaquil</div>
                        </div>
                        <div className="h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center">
                            {initials}
                        </div>
                        <button
                            onClick={handleLogout}
                            className="ml-1 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
                            title="Cerrar sesión"
                        >
                            <LogOut className="h-4 w-4" />
                            Salir
                        </button>
                    </div>
                </div>

                {/* Banner si faltan datos */}
                {!profileComplete && bannerMsg && (
                    <div className="border-t bg-amber-50 text-amber-900">
                        <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-2 text-sm">
                            <AlertTriangle className="h-4 w-4" />
                            <span>{bannerMsg}</span>
                            <button
                                onClick={() => navigate("/paciente/perfil")}
                                className="ml-auto underline underline-offset-2 hover:no-underline"
                            >
                                Ir a mi perfil
                            </button>
                        </div>
                    </div>
                )}
            </header>

            {/* Layout principal */}
            <div className="max-w-5xl mx-auto w-full grid md:grid-cols-[240px_1fr]">
                <aside className="hidden md:block border-r bg-white">
                    <PatientSidebar profileComplete={profileComplete} />
                </aside>

                <main className="p-4">
                    <Outlet />
                </main>
            </div>

            <SideDrawer open={open} onClose={() => setOpen(false)} width={240} title="CitasPsico">
                <PatientSidebar profileComplete={profileComplete} />
            </SideDrawer>
        </div>
    )
}
