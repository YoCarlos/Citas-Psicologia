import { Link, useNavigate } from "react-router-dom"
import { useState, useEffect } from "react"
import { apiPost } from "../lib/api"
import { setToken, getUserFromToken, isLoggedIn } from "../lib/auth"

export default function Login() {
    const navigate = useNavigate()

    useEffect(() => {
        if (isLoggedIn()) {
            const role = getUserFromToken()?.role
            navigate(role === "doctor" ? "/psico" : "/paciente", { replace: true })
        }
    }, [navigate])

    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState("")

    const canSubmit = email.trim() && password.length >= 1 && !loading

    async function handleSubmit(e) {
        e.preventDefault()
        if (!canSubmit) return
        setErrorMsg("")
        setLoading(true)
        try {
            const { access_token } = await apiPost("/auth/login", {
                email: email.trim().toLowerCase(),
                password,
            })

            setToken(access_token)

            const u = getUserFromToken()
            const role = u?.role

            if (role === "doctor") {
                navigate("/psico", { replace: true })
            } else if (role === "patient") {
                navigate("/paciente", { replace: true })
            } else {
                navigate("/", { replace: true })
            }
        } catch (err) {
            setErrorMsg(err.message || "No se pudo iniciar sesión.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-700 via-emerald-600 to-emerald-700 flex items-center justify-center px-4 py-8">
            <div className="w-full max-w-md">
                {/* tarjeta principal */}
                <div className="bg-white/95 rounded-3xl shadow-xl border border-emerald-100 px-6 py-7">
                    {/* encabezado tipo landing */}
                    <div className="flex items-center gap-3 justify-center">
                        <div className="h-10 w-10 rounded-2xl bg-emerald-600/10 flex items-center justify-center shadow-sm">
                            <span className="font-extrabold text-xl text-emerald-700">Ψ</span>
                        </div>
                        <div className="leading-tight text-center">
                            <p className="text-xs font-semibold text-emerald-700/80 uppercase tracking-[0.18em]">
                                Patricia Chérrez
                            </p>
                            <h1 className="text-xl md:text-2xl font-semibold text-emerald-900">
                                Iniciar sesión
                            </h1>
                        </div>
                    </div>

                    <p className="mt-3 text-sm text-center text-emerald-900/70">
                        Accede a tu panel para gestionar tus citas en línea.
                    </p>

                    {errorMsg && (
                        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 text-sm">
                            {errorMsg}
                        </div>
                    )}

                    <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                        <div>
                            <label className="block text-sm font-medium text-emerald-900">
                                Email
                            </label>
                            <input
                                type="email"
                                className="mt-1 w-full rounded-2xl border border-emerald-100 bg-emerald-50/40 px-3 py-2.5 text-sm text-emerald-900 placeholder:text-emerald-400 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-300"
                                placeholder="tu@correo.com"
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-emerald-900">
                                Contraseña
                            </label>
                            <input
                                type="password"
                                className="mt-1 w-full rounded-2xl border border-emerald-100 bg-emerald-50/40 px-3 py-2.5 text-sm text-emerald-900 placeholder:text-emerald-400 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-300"
                                placeholder="••••••••"
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={!canSubmit}
                            className={`w-full mt-2 py-2.5 rounded-2xl font-semibold text-sm transition flex items-center justify-center
                                ${canSubmit
                                    ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                                    : "bg-emerald-200 text-emerald-500 cursor-not-allowed"
                                }`}
                        >
                            {loading ? "Entrando..." : "Entrar"}
                        </button>
                    </form>

                    {/* link a registro, estilo píldora como en el landing */}
                    <div className="mt-6 flex flex-col items-center gap-3">
                        <div className="text-xs text-emerald-800/80">
                            ¿Aún no tienes cuenta?
                        </div>
                        <Link
                            to="/register"
                            className="inline-flex items-center justify-center px-5 py-2.5 rounded-2xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-600 shadow"
                        >
                            Registrarme
                        </Link>
                    </div>

                    <div className="mt-6 text-center">
                        <Link
                            to="/"
                            className="text-xs text-emerald-700 hover:text-emerald-900 hover:underline"
                        >
                            ← Volver al inicio
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
