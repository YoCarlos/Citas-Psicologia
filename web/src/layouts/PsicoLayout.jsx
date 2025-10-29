import React from "react"
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import {
    LayoutDashboard,
    Users,
    CalendarRange,
    CalendarDays,
    CalendarPlus,
    Lock,
    Settings,
    Menu,
    LogOut,
    Brain,
} from "lucide-react"
import SideDrawer from "../components/SideDrawer"
import { getUserFromToken, clearToken } from "../lib/auth"

const navItemBase =
    "flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm font-medium transition-colors"
const navActive = "bg-emerald-100 text-emerald-800 font-semibold"
const navInactive = "text-gray-700 hover:bg-emerald-50 hover:text-emerald-700"

function initialsFrom(nameOrEmail) {
    if (!nameOrEmail) return "D"
    const name = nameOrEmail.trim()
    if (name.includes(" ")) {
        const parts = name.split(/\s+/).filter(Boolean)
        return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase()
    }
    return name[0].toUpperCase()
}

function PsicoSidebar() {
    return (
        <div className="h-full flex flex-col w-[260px]">
            {/* Encabezado con logo bonito */}
            <div className="p-4 flex items-center gap-3 border-b">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-400 flex items-center justify-center text-white">
                    <Brain className="h-6 w-6" />
                </div>
                <div>
                    <div className="font-bold text-emerald-700 text-lg">CitasPsico</div>
                    <div className="text-xs text-gray-500">Panel de la psicóloga</div>
                </div>
            </div>

            {/* Navegación */}
            <nav className="flex-1 p-3 space-y-2">
                <NavLink
                    to="/psico"
                    end
                    className={({ isActive }) =>
                        `${navItemBase} ${isActive ? navActive : navInactive}`
                    }
                >
                    <LayoutDashboard className="h-4 w-4" />
                    <span>Resumen</span>
                </NavLink>

                <NavLink
                    to="/psico/pacientes"
                    className={({ isActive }) =>
                        `${navItemBase} ${isActive ? navActive : navInactive}`
                    }
                >
                    <Users className="h-4 w-4" />
                    <span>Pacientes</span>
                </NavLink>

                <NavLink
                    to="/psico/citas"
                    className={({ isActive }) =>
                        `${navItemBase} ${isActive ? navActive : navInactive}`
                    }
                >
                    <CalendarRange className="h-4 w-4" />
                    <span>Citas</span>
                </NavLink>

                <NavLink
                    to="/psico/calendario"
                    className={({ isActive }) =>
                        `${navItemBase} ${isActive ? navActive : navInactive}`
                    }
                >
                    <CalendarDays className="h-4 w-4" />
                    <span>Calendario</span>
                </NavLink>

                {/* ✅ Nuevas secciones */}
                <NavLink
                    to="/psico/agendar"
                    className={({ isActive }) =>
                        `${navItemBase} ${isActive ? navActive : navInactive}`
                    }
                >
                    <CalendarPlus className="h-4 w-4" />
                    <span>Agendar</span>
                </NavLink>

                <NavLink
                    to="/psico/bloquear"
                    className={({ isActive }) =>
                        `${navItemBase} ${isActive ? navActive : navInactive}`
                    }
                >
                    <Lock className="h-4 w-4" />
                    <span>Bloquear</span>
                </NavLink>

                <NavLink
                    to="/psico/configuracion"
                    className={({ isActive }) =>
                        `${navItemBase} ${isActive ? navActive : navInactive}`
                    }
                >
                    <Settings className="h-4 w-4" />
                    <span>Configuración</span>
                </NavLink>
            </nav>

            {/* Pie del sidebar */}
            <div className="p-3 border-t text-xs text-gray-400 text-center">
                © {new Date().getFullYear()} CitasPsico
            </div>
        </div>
    )
}

export default function PsicoLayout() {
    const [open, setOpen] = React.useState(false)
    const location = useLocation()
    const navigate = useNavigate()

    React.useEffect(() => setOpen(false), [location.pathname])

    const user = getUserFromToken()
    const displayName = user?.name || user?.email || "Doctora"
    const initials = initialsFrom(displayName)

    function handleLogout() {
        clearToken()
        navigate("/login", { replace: true })
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Topbar */}
            <header className="bg-white border-b sticky top-0 z-30">
                <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            className="md:hidden p-2 rounded-lg border hover:bg-gray-50"
                            onClick={() => setOpen(true)}
                            aria-label="Abrir menú"
                        >
                            <Menu className="h-5 w-5" />
                        </button>
                        <div className="font-semibold text-emerald-700">
                            Panel de Citas
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <div className="text-sm font-semibold text-gray-800">
                                {displayName.startsWith("Dra.")
                                    ? displayName
                                    : `Dra. ${displayName}`}
                            </div>
                            <div className="text-xs text-gray-500">Psicóloga clínica</div>
                        </div>
                        <div className="h-9 w-9 rounded-full bg-emerald-600 text-white flex items-center justify-center">
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
            </header>

            {/* Layout principal */}
            <div className="max-w-6xl mx-auto w-full grid md:grid-cols-[260px_1fr]">
                {/* Sidebar */}
                <aside className="hidden md:block border-r bg-white">
                    <PsicoSidebar />
                </aside>

                {/* Contenido */}
                <main className="p-4">
                    <Outlet />
                </main>
            </div>

            {/* Drawer móvil */}
            <SideDrawer open={open} onClose={() => setOpen(false)} width={260} title="CitasPsico">
                <PsicoSidebar />
            </SideDrawer>
        </div>
    )
}
