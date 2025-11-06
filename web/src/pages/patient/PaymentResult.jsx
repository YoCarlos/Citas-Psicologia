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
    const clientTx = sp.get("clientTransactionId") || sp.get("reference") || ""

    const [loading, setLoading] = React.useState(true)
    const [errorMsg, setErrorMsg] = React.useState("")
    const [okMsg, setOkMsg] = React.useState("")
    const [result, setResult] = React.useState(null) // respuesta cruda backend
    const [confirmedAppts, setConfirmedAppts] = React.useState([]) // detalles de citas confirmadas

    const goToMyAppts = () => nav("/paciente/citas")

    const fetchApptDetails = React.useCallback(async (ids) => {
        const safeIds = Array.isArray(ids) ? ids.filter((x) => Number.isFinite(Number(x))) : []
        if (!safeIds.length) return []
        const details = await Promise.all(
            safeIds.map(async (id) => {
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

    const doConfirm = React.useCallback(async () => {
        setLoading(true)
        setErrorMsg("")
        setOkMsg("")
        setResult(null)
        setConfirmedAppts([])

        try {
            if (!user?.id) {
                setErrorMsg("No hay sesión activa de paciente.")
                return
            }
            if (!txnIdStr || !clientTx) {
                setErrorMsg("Faltan parámetros en la URL (id y/o clientTransactionId).")
                return
            }

            const txnIdNum = Number.isFinite(Number(txnIdStr)) ? Number(txnIdStr) : undefined
            const payload = {
                id: txnIdNum ?? txnIdStr,     // el backend espera int; si no es número, se envía como está
                clientTxId: clientTx,
            }

            // 👉 Llamada central: el backend valida con PayPhone, confirma citas y guarda el pago (idempotente).
            const resp = await apiPost("/payments/payphone/confirm", payload)
            setResult(resp || {})

            const approved = !!resp?.approved
            const statusText = String(resp?.transaction_status || "").toLowerCase()

            if (approved) {
                const ids = resp?.confirmed_appointment_ids || []
                if (ids.length > 0) {
                    const details = await fetchApptDetails(ids)
                    setConfirmedAppts(details)
                    setOkMsg("¡Pago verificado! Tus horarios fueron confirmados ✅")
                } else {
                    // Aprobado pero sin nuevas confirmaciones (posible confirmación previa/idempotente)
                    setOkMsg(resp?.message || "Pago verificado. No se detectaron nuevas confirmaciones.")
                }
            } else {
                // No aprobado: pending / canceled / otro
                if (statusText === "pending") {
                    setErrorMsg("Tu pago aún está en proceso. Reintenta más tarde o revisa tus citas.")
                } else if (statusText === "canceled") {
                    setErrorMsg("El pago fue cancelado.")
                } else {
                    setErrorMsg(resp?.message || "No pudimos verificar un pago aprobado. Si el cargo existe, contacta soporte.")
                }
            }
        } catch (e) {
            console.error("[PaymentResult] confirm error:", e)
            setErrorMsg(e?.message || "No se pudo procesar el resultado del pago.")
        } finally {
            setLoading(false)
        }
    }, [clientTx, txnIdStr, user?.id, fetchApptDetails])

    React.useEffect(() => {
        doConfirm()
    }, [doConfirm])

    const txnIdShown = result?.transaction_id || txnIdStr || "—"
    const statusShown = result?.transaction_status || (result?.approved ? "Approved" : "—")
    const clientTxShown = result?.client_tx_id || clientTx || "—"
    const amountShown = Number.isFinite(Number(result?.amount_cents))
        ? (Number(result.amount_cents) / 100).toFixed(2)
        : "—"

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-emerald-800">Resultado del pago</h1>
                    <p className="text-gray-600">
                        Validando tu transacción con PayPhone y confirmando tus horarios.
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

            {/* Card principal */}
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
                                <span><strong>Transacción:</strong> {txnIdShown}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Info className="h-4 w-4" />
                                <span><strong>Referencia cliente (clientTxId):</strong> {clientTxShown}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Info className="h-4 w-4" />
                                <span><strong>Estado PayPhone:</strong> {statusShown}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Info className="h-4 w-4" />
                                <span><strong>Monto:</strong> {amountShown === "—" ? "—" : `$${amountShown}`}</span>
                            </div>
                        </div>

                        {/* Citas confirmadas (si las hay) */}
                        <div className="mt-5">
                            <h3 className="font-semibold text-emerald-900">Citas confirmadas</h3>
                            {confirmedAppts.length === 0 ? (
                                <p className="text-sm text-gray-500 mt-1">
                                    {result?.approved
                                        ? "Pago aprobado. No se detectaron nuevas confirmaciones (puede ser idempotencia o ya estaban confirmadas)."
                                        : "No hay confirmaciones nuevas."}
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

                            {/* Reintentar verificación (por si pasa de pending→approved) */}
                            <button
                                onClick={doConfirm}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-gray-50"
                            >
                                Reintentar verificación
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* Debug opcional */}
            {result && (
                <details className="mt-2 text-xs text-gray-600">
                    <summary className="cursor-pointer">Detalles técnicos (debug)</summary>
                    <pre className="mt-2 p-3 bg-gray-50 rounded border overflow-auto">
                        {JSON.stringify(result, null, 2)}
                    </pre>
                </details>
            )}
        </div>
    )
}
