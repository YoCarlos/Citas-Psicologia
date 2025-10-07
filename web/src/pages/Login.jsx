import { Link, useNavigate } from "react-router-dom"
import { useState } from "react"
import { apiPost } from "../lib/api"
import { setToken, getUserFromToken, isLoggedIn } from "../lib/auth"
import { useEffect } from "react"

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
            // tu backend devuelve { access_token, token_type, expires_in }
            const { access_token } = await apiPost("/auth/login", {
                email: email.trim().toLowerCase(),
                password,
            })

            setToken(access_token)

            // leemos el rol del JWT para decidir la ruta
            const u = getUserFromToken()
            const role = u?.role

            if (role === "doctor") {
                navigate("/psico", { replace: true })
            } else if (role === "patient") {
                navigate("/paciente", { replace: true })
            } else {
                // fallback por si no hay rol en el token
                navigate("/", { replace: true })
            }
        } catch (err) {
            setErrorMsg(err.message || "No se pudo iniciar sesión.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow p-6">
                <h1 className="text-2xl font-bold text-center">Iniciar sesión</h1>
                <p className="text-sm text-gray-600 text-center mt-1">
                    Ingresa para acceder a tus citas.
                </p>

                {errorMsg && (
                    <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2 text-sm">
                        {errorMsg}
                    </div>
                )}

                <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Email</label>
                        <input
                            type="email"
                            className="mt-1 w-full rounded-lg border-gray-300 focus:ring-emerald-600 focus:border-emerald-600"
                            placeholder="tu@correo.com"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Contraseña</label>
                        <input
                            type="password"
                            className="mt-1 w-full rounded-lg border-gray-300 focus:ring-emerald-600 focus:border-emerald-600"
                            placeholder="••••••••"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={!canSubmit}
                        className={`w-full py-2.5 rounded-lg font-semibold text-white transition
              ${canSubmit ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-300 cursor-not-allowed"}
            `}
                    >
                        {loading ? "Entrando..." : "Entrar"}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <Link to="/" className="text-emerald-700 hover:underline">
                        ← Volver al inicio
                    </Link>
                </div>
            </div>
        </div>
    )
}
