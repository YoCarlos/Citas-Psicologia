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
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4 py-8 relative overflow-hidden">
            {/* fondo decorativo */}
            <div className="pointer-events-none absolute inset-0 opacity-60">
                <div className="absolute -top-32 -right-24 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
                <div className="absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                {/* Tarjeta principal */}
                <div className="rounded-3xl border border-white/10 bg-slate-950/80 backdrop-blur-xl shadow-2xl px-6 py-7">
                    {/* encabezado con icono */}
                    <div className="flex flex-col items-center gap-3">
                        <div className="h-12 w-12 rounded-2xl bg-emerald-500/15 border border-emerald-400/40 flex items-center justify-center shadow-inner">
                            <span className="text-2xl font-black text-emerald-300">Ψ</span>
                        </div>
                        <div className="text-center">
                            <h1 className="text-2xl font-semibold tracking-tight">
                                Iniciar sesión
                            </h1>
                            <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-emerald-300/80">
                                Portal de CitasPsico
                            </p>
                            <p className="mt-2 text-sm text-slate-300">
                                Ingresa con tu cuenta para gestionar tus citas en línea.
                            </p>
                        </div>
                    </div>

                    {errorMsg && (
                        <div className="mt-5 rounded-2xl border border-rose-500/40 bg-rose-500/10 text-rose-100 px-4 py-3 text-sm flex gap-2">
                            <span className="mt-0.5 text-lg">!</span>
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-slate-100">
                                Email
                            </label>
                            <input
                                type="email"
                                className="mt-0.5 block w-full rounded-2xl border border-slate-600/70 bg-slate-900/70 px-3 py-2.5 text-sm text-white placeholder:text-slate-400 shadow-inner outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/60"
                                placeholder="tu@correo.com"
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="block text-sm font-medium text-slate-100">
                                    Contraseña
                                </label>
                                {/* Si luego quieres, aquí va "¿Olvidaste tu contraseña?" */}
                            </div>
                            <input
                                type="password"
                                className="mt-0.5 block w-full rounded-2xl border border-slate-600/70 bg-slate-900/70 px-3 py-2.5 text-sm text-white placeholder:text-slate-400 shadow-inner outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/60"
                                placeholder="••••••••"
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={!canSubmit}
                            className={`mt-2 w-full inline-flex items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-semibold transition 
                                ${canSubmit
                                    ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30"
                                    : "bg-slate-700/60 text-slate-300 cursor-not-allowed"
                                }`}
                        >
                            {loading ? (
                                <>
                                    <span className="h-4 w-4 rounded-full border-2 border-slate-950/40 border-t-transparent animate-spin" />
                                    Entrando...
                                </>
                            ) : (
                                "Entrar"
                            )}
                        </button>
                    </form>

                    {/* separador + link a registro */}
                    <div className="mt-6">
                        <div className="flex items-center gap-3 text-xs text-slate-400">
                            <div className="h-px flex-1 bg-slate-600/60" />
                            <span>¿Aún no tienes cuenta?</span>
                            <div className="h-px flex-1 bg-slate-600/60" />
                        </div>

                        <div className="mt-3 flex justify-center">
                            <Link
                                to="/register"
                                className="inline-flex items-center gap-1.5 rounded-2xl border border-emerald-400/60 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20 hover:border-emerald-300 transition"
                            >
                                Crear cuenta
                            </Link>
                        </div>
                    </div>

                    <div className="mt-6 text-center text-xs text-slate-400">
                        <Link
                            to="/"
                            className="inline-flex items-center gap-1 hover:text-emerald-300 transition"
                        >
                            <span>←</span>
                            <span>Volver a la página principal</span>
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
