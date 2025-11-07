// src/pages/paciente/PaymentResult.jsx
import React from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { apiGet, apiPost } from "../../lib/api"
import { getUserFromToken } from "../../lib/auth"
import { CheckCircle2, XCircle, ArrowLeft, CalendarClock, Info } from "lucide-react"

const TZ = "America/Guayaquil"
const hasTZ = (s) => /Z$|[+\-]\d{2}:\d{2}$/.test(s || "")

/**
 * IMPORTANTE:
 * Si la cadena ISO no tiene zona horaria, la tratamos como UTC (añadimos 'Z'),
 * NO como -05:00. Luego siempre formateamos al huso de Guayaquil.
 */
const parseAsUTC = (iso) => new Date(hasTZ(iso) ? iso : `${iso}Z`)

const toLocalYMD = (iso) => {
    const d = parseAsUTC(iso)
    const y = d.toLocaleString("en-CA", { year: "numeric", timeZone: TZ })
    const m = d.toLocaleString("en-CA", { month: "2-digit", timeZone: TZ })
    const day = d.toLocaleString("en-CA", { day: "2-digit", timeZone: TZ })
    return `${y}-${m}-${day}`
}
const toLocalHM = (iso) =>
    parseAsUTC(iso).toLocaleTimeString("es-EC", {
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

    // PayPhone puede enviarte transactionId como ?id= o ?transactionId=
    const txnIdStr = sp.get("id") || sp.get("transactionId") || ""

    // Tus citas vienen como "appts=58,59,60,61,62" en optionalParameter3
    const rawAppts = sp.get("optionalParameter3") || ""
    const csv = rawAppts.startsWith("appts=") ? rawAppts.slice(6) : rawAppts
    const appointmentIds = csv
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0)

    const [loading, setLoading] = React.useState(true)
    const [errorMsg, setErrorMsg] = React.useState("")
    const [okMsg, setOkMsg] = React.useState("")
    const [confirmedAppts, setConfirmedAppts] = React.useState([])
    const [debugInfo, setDebugInfo] = React.useState([])

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
        setDebugInfo([])

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
                    // Seguimos con las demás aunque una falle por conflicto/expiración
                    // eslint-disable-next-line no-console
                    console.error(`Error al confirmar cita ${id}:`, err)
                }
            }

            if (confirmed.length > 0) {
                setConfirmedAppts(confirmed)
                setOkMsg(`Se confirmaron ${confirmed.length} cita(s) correctamente. ¡Pago verificado! ✅`)

                // Debug visual de las horas originales y cómo se renderizan
                const dbg = confirmed.map((a) => ({
                    id: a.id,
                    raw_start: a.start_at,
                    raw_end: a.end_at,
                    shown_start: `${toLocalYMD(a.start_at)} ${toLocalHM(a.start_at)}`,
                    shown_end: toLocalHM(a.end_at),
                    status: a.status,
                }))
                setDebugInfo(dbg)
            } else {
                setErrorMsg("No se pudo confirmar ninguna cita. Si el pago fue exitoso, contacta soporte.")
            }
        } catch (e) {
            // eslint-disable-next-line no-console
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
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-emerald-800">Resultado del pago</h1>
                    <p className="text-gray-600">Verificando y confirmando tus horarios reservados.</p>
                </div>
                <button
                    onClick={goToMyAppts}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-gray-50 text-sm"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Mis citas
                </button>
            </div>

            {/* Card principal */}
            <div className="rounded-2xl bg-white p-5 border shadow-sm">
                {loading ? (
                    <div className="flex items-center gap-3 text-sm text-gray-600">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
                            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" />
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
                                    No se confirmaron citas nuevas. Puede que ya estuvieran confirmadas o el pago no
                                    se haya completado.
                                </p>
                            ) : (
                                <ul className="mt-2 space-y-2">
                                    {confirmedAppts.map((a) => (
                                        <li key={a.id} className="text-sm text-gray-800">
                                            <span className="font-mono text-blue-700">
                                                {toLocalYMD(a.start_at)} {toLocalHM(a.start_at)}–{toLocalHM(a.end_at)}
                                            </span>
                                            <span className="text-gray-600"> • estado: </span>
                                            <span className="font-medium text-emerald-700">{a.status}</span>
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

            {/* Debug Return URL */}
            <div className="mt-3 rounded-lg border px-3 py-2 text-xs text-gray-700 bg-gray-50">
                <div className="flex items-center gap-2 mb-1">
                    <Info className="h-3.5 w-3.5" />
                    <span className="font-medium">DEBUG Return URL</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-1">
                    <div><strong>transactionId:</strong> {txnIdStr || "—"}</div>
                    <div><strong>optionalParameter3 (URL):</strong> {rawAppts || "—"}</div>
                    <div>
                        <strong>Citas detectadas:</strong>{" "}
                        {appointmentIds.length ? appointmentIds.join(", ") : "—"}
                    </div>
                </div>
            </div>

            {/* Debug parse de horas */}
            {debugInfo.length > 0 && (
                <details className="mt-2 text-xs text-gray-600">
                    <summary className="cursor-pointer">Debug de horas (crudo vs mostrado)</summary>
                    <pre className="mt-2 p-3 bg-gray-50 rounded border overflow-auto">
                        {JSON.stringify(debugInfo, null, 2)}
                    </pre>
                </details>
            )}
        </div>
    )
}
