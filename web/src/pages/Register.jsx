import { Link, useNavigate } from "react-router-dom"
import { User, Mail, Globe2, Lock } from "lucide-react"
import { useState } from "react"
import { apiPost } from "../lib/api"

export default function Register() {
    const navigate = useNavigate()
    const [form, setForm] = useState({
        firstName: "",
        lastName: "",
        email: "",
        region: "",
        password: "",
        confirm: "",
        accept: false,
    })
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState("")
    const [okMsg, setOkMsg] = useState("")

    const passwordsFilled = form.password.length > 0 && form.confirm.length > 0
    const passwordsMatch = form.password === form.confirm
    const canSubmit =
        form.firstName &&
        form.lastName &&
        form.email &&
        form.region &&
        passwordsFilled &&
        passwordsMatch &&
        form.accept &&
        !loading

    async function handleSubmit(e) {
        e.preventDefault()
        if (!canSubmit) return
        setErrorMsg("")
        setOkMsg("")
        setLoading(true)
        try {

            const payload = {
                email: form.email.trim(),
                password: form.password,
                full_name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
                role: "patient",
                region: form.region,
                doctor_id: 2,
            }

            await apiPost("/auth/register", payload)

            setOkMsg("Cuenta creada. Revisa tu correo e inicia sesión.")
            // pequeño delay para que el usuario lea el mensaje
            setTimeout(() => navigate("/login", { replace: true }), 900)
        } catch (err) {
            setErrorMsg(err.message || "No se pudo crear la cuenta.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 px-4">
            <div className="w-full max-w-md">
                <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
                    <header className="mb-6 text-center">
                        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                            Crea tu cuenta de paciente
                        </h1>
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                            Completa los datos para empezar a agendar citas.
                        </p>
                    </header>

                    {/* Mensajes */}
                    {errorMsg && (
                        <div className="mb-4 rounded-xl border border-rose-300/50 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200 px-3 py-2 text-sm">
                            {errorMsg}
                        </div>
                    )}
                    {okMsg && (
                        <div className="mb-4 rounded-xl border border-emerald-300/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200 px-3 py-2 text-sm">
                            {okMsg}
                        </div>
                    )}

                    <form className="space-y-4" onSubmit={handleSubmit}>
                        {/* Nombre */}
                        <div>
                            <label htmlFor="firstName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Nombre
                            </label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <User className="h-5 w-5 text-slate-400" />
                                </span>
                                <input
                                    id="firstName"
                                    type="text"
                                    autoComplete="given-name"
                                    placeholder="Ej. Ana"
                                    value={form.firstName}
                                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                                    className="block w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-10 pr-3 py-2 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-emerald-500 transition"
                                />
                            </div>
                        </div>

                        {/* Apellido */}
                        <div>
                            <label htmlFor="lastName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Apellido
                            </label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <User className="h-5 w-5 text-slate-400" />
                                </span>
                                <input
                                    id="lastName"
                                    type="text"
                                    autoComplete="family-name"
                                    placeholder="Ej. Pérez"
                                    value={form.lastName}
                                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                                    className="block w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-10 pr-3 py-2 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-emerald-500 transition"
                                />
                            </div>
                        </div>

                        {/* Correo */}
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Correo electrónico
                            </label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-slate-400" />
                                </span>
                                <input
                                    id="email"
                                    type="email"
                                    autoComplete="email"
                                    placeholder="tucorreo@ejemplo.com"
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    className="block w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-10 pr-3 py-2 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-emerald-500 transition"
                                />
                            </div>
                        </div>

                        {/* Región / Continente */}
                        <div>
                            <label htmlFor="region" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Región (continente)
                            </label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Globe2 className="h-5 w-5 text-slate-400" />
                                </span>
                                <select
                                    id="region"
                                    value={form.region}
                                    onChange={(e) => setForm({ ...form, region: e.target.value })}
                                    className="block w-full appearance-none rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-10 pr-10 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-emerald-500 transition"
                                >
                                    <option value="" disabled>Selecciona tu región</option>
                                    <option value="south_america">Sudamérica</option>
                                    <option value="north_america">Norteamérica</option>
                                    <option value="central_america">Centroamérica</option>
                                    <option value="europe">Europa</option>
                                    <option value="asia">Asia</option>
                                    <option value="africa">África</option>
                                    <option value="oceania">Oceanía</option>
                                    <option value="other">Otra</option>
                                </select>
                                <span className="pointer-events-none absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400">▾</span>
                            </div>
                        </div>

                        {/* Contraseña */}
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Contraseña
                            </label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-slate-400" />
                                </span>
                                <input
                                    id="password"
                                    type="password"
                                    autoComplete="new-password"
                                    placeholder="Mínimo 8 caracteres"
                                    value={form.password}
                                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                                    className={`block w-full rounded-xl border ${passwordsFilled && !passwordsMatch ? "border-rose-400 dark:border-rose-500" : "border-slate-300 dark:border-slate-700"
                                        } bg-white dark:bg-slate-800 pl-10 pr-3 py-2 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-emerald-500 transition`}
                                />
                            </div>
                        </div>

                        {/* Repetir contraseña */}
                        <div>
                            <label htmlFor="confirm" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Repite la contraseña
                            </label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-slate-400" />
                                </span>
                                <input
                                    id="confirm"
                                    type="password"
                                    autoComplete="new-password"
                                    placeholder="Vuelve a escribirla"
                                    value={form.confirm}
                                    onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                                    className={`block w-full rounded-xl border ${passwordsFilled && !passwordsMatch ? "border-rose-400 dark:border-rose-500" : "border-slate-300 dark:border-slate-700"
                                        } bg-white dark:bg-slate-800 pl-10 pr-3 py-2 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-emerald-500 transition`}
                                />
                            </div>
                            {passwordsFilled && !passwordsMatch && (
                                <p className="mt-1 text-xs text-rose-500">Las contraseñas no coinciden.</p>
                            )}
                        </div>

                        {/* Aceptar términos */}
                        <div className="pt-2">
                            <label className="inline-flex items-start gap-3 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={form.accept}
                                    onChange={(e) => setForm({ ...form, accept: e.target.checked })}
                                    className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500"
                                />
                                <span className="text-sm text-slate-600 dark:text-slate-300">
                                    Acepto los{" "}
                                    <Link to="/terms" className="underline hover:no-underline">Términos y Condiciones</Link>{" "}
                                    y la{" "}
                                    <Link to="/privacy" className="underline hover:no-underline">Política de Privacidad</Link>.
                                </span>
                            </label>
                        </div>

                        {/* Botón */}
                        <button
                            type="submit"
                            disabled={!canSubmit}
                            className={`w-full mt-2 inline-flex items-center justify-center rounded-xl font-medium py-2.5 transition focus:outline-none focus:ring-2 focus:ring-offset-2
                ${canSubmit
                                    ? "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white focus:ring-emerald-500"
                                    : "bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed"
                                }`}
                            aria-disabled={!canSubmit}
                        >
                            {loading ? "Creando..." : "Crear cuenta"}
                        </button>
                    </form>

                    <div className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
                        ¿Ya tienes cuenta?{" "}
                        <Link to="/login" className="font-medium text-emerald-600 hover:text-emerald-700">
                            Inicia sesión
                        </Link>
                    </div>
                </div>

                <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-500">
                    Al registrarte aceptas nuestros{" "}
                    <Link to="/terms" className="underline hover:no-underline">Términos y Condiciones</Link> y la{" "}
                    <Link to="/privacy" className="underline hover:no-underline">Política de Privacidad</Link>.
                </p>
            </div>
        </div>
    )
}

