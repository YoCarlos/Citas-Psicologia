// src/pages/paciente/PaymentResult.jsx
import React from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { apiGet, apiPost } from "../../lib/api"
import { getUserFromToken } from "../../lib/auth"
import { CheckCircle2, XCircle, ArrowLeft, CalendarClock, Info } from "lucide-react"

const TZ = "America/Guayaquil"
const hasTZ = (s) => /Z$|[+\-]\d{2}:\d{2}$/.test(s || "")
const parseAsGYE = (iso) => new Date(hasTZ(iso) ? iso : `${iso}-05:00`)
const toLocalYMD = (iso) => {
    const d = parseAsGYE(iso)
    const y = d.toLocaleString("en-CA", { year: "numeric", timeZone: TZ })
    const m = d.toLocaleString("en-CA", { month: "2-digit", timeZone: TZ })
    const day = d.toLocaleString("en-CA", { day: "2-digit", timeZone: TZ })
    return `${y}-${m}-${day}`
}
const toLocalHM = (iso) =>
    parseAsGYE(iso).toLocaleTimeString("es-EC", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: TZ,
    })

export default function PaymentResult() {
    const nav = useNavigate()
    const loc = useLocation()
    const sp = new URLSearchParams(loc.search)

    const user = getUserFromToken()
    const txnIdStr = sp.get("id") || sp.get("transactionId") || ""
    const appointmentStr = sp.get("optionalParameter3") || "" // IDs de citas separados por coma
    const appointmentIds = appointmentStr
        .split(",")
        .map((s) => parseInt(s))
        .filter((n) => !isNaN(n) && n > 0)

    const [loading, setLoading] = React.useState(true)
    const [errorMsg, setErrorMsg] = React.useState("")
    const [okMsg, setOkMsg] = React.useState("")
    const [confirmedAppts, setConfirmedAppts] = React.useState([])

    const goToMyAppts = () => nav("/paciente/citas")

    const fetchApptDetails = React.useCallback(async (ids) => {
        const details = await Promise.all(
            ids.map(async (id) => {
                try {
                    const a = await apiGet(`/appointments/${id}`)
                    return a
                } catch {
                    return null
                }
            })
        )
        return details.filter(Boolean)
    }, [])

    const confirmAppointments = React.useCallback(async () => {
        setLoading(true)
        setErrorMsg("")
        setOkMsg("")
        setConfirmedAppts([])

        try {
            if (!user?.id) {
                setErrorMsg("No hay sesión activa de paciente.")
                return
            }
            if (!appointmentIds.length) {
                setErrorMsg("No se detectaron citas asociadas a este pago.")
                return
            }

            const confirmed = []
            for (const id of appointmentIds) {
                try {
                    const res = await apiPost(`/appointments/${id}/confirm`, {})
                    confirmed.push(res)
                } catch (err) {
                    console.error(`Error al confirmar cita ${id}:`, err)
                }
            }

            if (confirmed.length > 0) {
                setConfirmedAppts(confirmed)
                setOkMsg(
                    `Se confirmaron ${confirmed.length} cita(s) correctamente. ¡Pago verificado! ✅`
                )
            } else {
                setErrorMsg(
                    "No se pudo confirmar ninguna cita. Si el pago fue exitoso, contacta soporte."
                )
            }
        } catch (e) {
            console.error("[PaymentResult] confirm error:", e)
            setErrorMsg(e?.message || "No se pudo procesar el resultado del pago.")
        } finally {
            setLoading(false)
        }
    }, [appointmentIds, user?.id])

    React.useEffect(() => {
        confirmAppointments()
    }, [confirmAppointments])

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-emerald-800">Resultado del pago</h1>
                    <p className="text-gray-600">
                        Verificando y confirmando tus horarios reservados.
                    </p>
                </div>
                <button
                    onClick={goToMyAppts}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-gray-50 text-sm"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Mis citas
                </button>
            </div>

            <div className="rounded-2xl bg-white p-5 border shadow-sm">
                {loading ? (
                    <div className="flex items-center gap-3 text-sm text-gray-600">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                            <circle
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                                opacity="0.25"
                            />
                            <path
                                d="M22 12a10 10 0 0 1-10 10"
                                stroke="currentColor"
                                strokeWidth="4"
                            />
                        </svg>
                        Confirmando citas con el servidor…
                    </div>
                ) : (
                    <>
                        {okMsg && (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 px-3 py-2 text-sm flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4" /> {okMsg}
                            </div>
                        )}
                        {errorMsg && (
                            <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2 text-sm flex items-center gap-2 mt-2">
                                <XCircle className="h-4 w-4" /> {errorMsg}
                            </div>
                        )}

                        {/* Citas confirmadas */}
                        <div className="mt-5">
                            <h3 className="font-semibold text-emerald-900">Citas confirmadas</h3>
                            {confirmedAppts.length === 0 ? (
                                <p className="text-sm text-gray-500 mt-1">
                                    No se confirmaron citas nuevas. Puede que ya estuvieran
                                    confirmadas o el pago no se haya completado.
                                </p>
                            ) : (
                                <ul className="mt-2 space-y-2">
                                    {confirmedAppts.map((a) => (
                                        <li key={a.id} className="text-sm text-gray-800">
                                            <span className="font-mono text-blue-700">
                                                {toLocalYMD(a.start_at)} {toLocalHM(a.start_at)}–
                                                {toLocalHM(a.end_at)}
                                            </span>
                                            <span className="text-gray-600"> • estado: </span>
                                            <span className="font-medium text-emerald-700">
                                                {a.status}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Acciones */}
                        <div className="mt-6 flex items-center gap-3">
                            <button
                                onClick={goToMyAppts}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-gray-50"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Ir a mis citas
                            </button>
                            <button
                                onClick={confirmAppointments}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-gray-50"
                            >
                                Reintentar confirmación
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* Debug */}
            <div className="text-xs text-gray-600 mt-3">
                <p>
                    <strong>Txn ID:</strong> {txnIdStr || "—"}
                </p>
                <p>
                    <strong>Citas detectadas:</strong>{" "}
                    {appointmentIds.length > 0 ? appointmentIds.join(", ") : "—"}
                </p>
            </div>
        </div>
    )
}
