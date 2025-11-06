// src/pages/patient/PaymentResult.jsx
import React from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { apiGet, apiPost } from "../../lib/api"
import { getUserFromToken } from "../../lib/auth"
import { CheckCircle2, XCircle, Clock, ArrowLeft, CalendarClock, Info } from "lucide-react"

const TZ = "America/Guayaquil"
const pad = (n) => String(n).padStart(2, "0")

// --- helpers robustos de fecha (maneja Z o sin zona) ---
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
    const txnId = sp.get("id") || sp.get("transactionId") || ""
    const clientTx = sp.get("clientTransactionId") || sp.get("reference") || ""

    const [loading, setLoading] = React.useState(true)
    const [errorMsg, setErrorMsg] = React.useState("")
    const [okMsg, setOkMsg] = React.useState("")
    const [confirmed, setConfirmed] = React.useState([]) // citas confirmadas
    const [pendingSeen, setPendingSeen] = React.useState([]) // pending que detectamos
    const [debugInfo, setDebugInfo] = React.useState(null)

    const goBack = () => nav("/paciente/citas")

    React.useEffect(() => {
        const run = async () => {
            setLoading(true)
            setErrorMsg("")
            setOkMsg("")

            try {
                if (!user?.id) {
                    setErrorMsg("No hay sesión activa de paciente.")
                    return
                }

                // 1) Traer *todas* las citas del paciente y filtrar client-side
                const all = await apiGet(`/appointments?patient_id=${user.id}`)
                const now = new Date()

                // candidates: pending + payphone + hold_until futuro
                const candidates = (all || []).filter((a) => {
                    try {
                        const st = (a.status || "").toLowerCase()
                        const isPending = st === "pending"
                        const isPayphone = (a.method || "").toLowerCase() === "payphone"
                        const holdOk = a.hold_until ? new Date(a.hold_until) > now : false
                        return isPending && isPayphone && holdOk
                    } catch {
                        return false
                    }
                })

                setPendingSeen(candidates)

                // 2) Confirmar cada una (si no hay ninguna, no es error: puede que ya estén confirmadas)
                const confirmedNow = []
                for (const appt of candidates) {
                    try {
                        const c = await apiPost(`/appointments/${appt.id}/confirm`, {})
                        confirmedNow.push(c)
                        console.debug("[PaymentResult] Confirmada", c?.id, c)
                    } catch (err) {
                        // si ya estaba confirmada o conflicto → lo reportamos pero seguimos
                        console.warn("[PaymentResult] No se pudo confirmar", appt?.id, err)
                    }
                }

                // 3) Registrar pago (idempotente: si backend rechaza por duplicado, lo ignoramos)
                //    Tomamos la primera confirmada; si no hubo nuevas, intenta con la primera pendiente que vimos
                const refAppt = confirmedNow[0] || candidates[0] || null
                if (refAppt && txnId) {
                    try {
                        await apiPost(`/payments`, {
                            appointment_id: refAppt.id,
                            method: "payphone",
                            payphone_id: txnId,
                            confirmed_by_doctor: true,
                            client_transaction_id: clientTx || null,
                        })
                        console.debug("[PaymentResult] Pago registrado para appt", refAppt.id)
                    } catch (e) {
                        // Podría ser ya registrado/duplicado → no abortamos
                        console.warn("[PaymentResult] No se pudo registrar pago (idempotencia u otro):", e)
                    }
                }

                // 4) Mensajes al usuario
                const anyConfirmed = confirmedNow.length > 0
                if (anyConfirmed) {
                    setOkMsg("¡Pago verificado! Tus horarios fueron confirmados ✅")
                } else if (candidates.length === 0) {
                    // nada pending con hold vigente; tal vez ya estaban confirmadas o expiró el hold
                    setOkMsg("Pago recibido. No hay reservas pendientes por confirmar en este momento.")
                } else {
                    setErrorMsg("Pago recibido, pero no pudimos confirmar tus horarios automáticamente. Intenta actualizar o contacta soporte.")
                }

                setConfirmed(confirmedNow)

                // 5) debug opcional
                setDebugInfo({
                    query: Object.fromEntries(sp.entries()),
                    txnId,
                    clientTx,
                    pendingCount: candidates.length,
                    confirmedCount: confirmedNow.length,
                    pendingSample: candidates.slice(0, 3),
                })
            } catch (e) {
                console.error(e)
                setErrorMsg(e?.message || "No se pudo procesar el resultado del pago.")
            } finally {
                setLoading(false)
            }
        }
        run()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-emerald-800">Resultado del pago</h1>
                    <p className="text-gray-600">
                        Estamos verificando tu transacción y confirmando tus horarios.
                    </p>
                </div>
                <button onClick={goBack} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-gray-50 text-sm">
                    <ArrowLeft className="h-4 w-4" />
                    Mis citas
                </button>
            </div>

            {/* Estado principal */}
            <div className="rounded-2xl bg-white p-5 border shadow-sm">
                {loading ? (
                    <div className="flex items-center gap-3 text-sm text-gray-600">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
                            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" />
                        </svg>
                        Procesando pago y reservas…
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

                        {/* Datos de la transacción */}
                        <div className="mt-4 grid gap-2 text-sm text-gray-700">
                            <div className="flex items-center gap-2">
                                <CalendarClock className="h-4 w-4" />
                                <span><strong>Transacción:</strong> {txnId || "—"}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Info className="h-4 w-4" />
                                <span><strong>Referencia cliente:</strong> {clientTx || "—"}</span>
                            </div>
                        </div>

                        {/* Citas confirmadas en esta pantalla */}
                        <div className="mt-5">
                            <h3 className="font-semibold text-emerald-900">Citas confirmadas</h3>
                            {confirmed.length === 0 ? (
                                <p className="text-sm text-gray-500 mt-1">No se confirmaron nuevas citas en esta página.</p>
                            ) : (
                                <ul className="mt-2 space-y-2">
                                    {confirmed.map((a) => (
                                        <li key={a.id} className="text-sm text-gray-800">
                                            <span className="font-mono text-blue-700">{toLocalYMD(a.start_at)} {toLocalHM(a.start_at)}–{toLocalHM(a.end_at)}</span>
                                            <span className="text-gray-600"> • estado: </span>
                                            <span className="font-medium text-emerald-700">{a.status}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Vimos pending con hold vigente? (info útil para el usuario) */}
                        {pendingSeen.length > 0 && confirmed.length === 0 && (
                            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2 text-sm">
                                Detectamos {pendingSeen.length} reserva(s) en proceso. Si no se confirmaron, puede que el bloqueo haya expirado o haya habido un conflicto de horario.
                            </div>
                        )}

                        <div className="mt-6 flex items-center gap-3">
                            <button onClick={goBack} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-gray-50">
                                <ArrowLeft className="h-4 w-4" />
                                Ir a mis citas
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* Debug opcional visible para soporte */}
            {debugInfo && (
                <details className="mt-2 text-xs text-gray-600">
                    <summary className="cursor-pointer">Detalles técnicos (debug)</summary>
                    <pre className="mt-2 p-3 bg-gray-50 rounded border overflow-auto">
                        {JSON.stringify(debugInfo, null, 2)}
                    </pre>
                </details>
            )}
        </div>
    )
}
