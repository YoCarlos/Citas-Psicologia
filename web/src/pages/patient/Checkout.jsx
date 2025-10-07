// src/pages/paciente/Checkout.jsx
import React from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { apiPost } from "../../lib/api"
import { getUserFromToken } from "../../lib/auth"
import { ArrowLeft, ArrowRight, CreditCard, Clock } from "lucide-react"

const TZ = "America/Guayaquil"

const toLocalHM = (isoString) =>
    new Date(isoString).toLocaleTimeString("es-EC", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: TZ,
    })

const toLocalYMD = (isoString) => {
    const d = new Date(isoString)
    const y = d.toLocaleString("en-CA", { year: "numeric", timeZone: TZ })
    const m = d.toLocaleString("en-CA", { month: "2-digit", timeZone: TZ })
    const day = d.toLocaleString("en-CA", { day: "2-digit", timeZone: TZ })
    return `${y}-${m}-${day}`
}

// Agrupa items [{start_at,end_at}] por día local
function groupByDay(items) {
    const map = {}
    for (const it of items) {
        const ymd = toLocalYMD(it.start_at)
        if (!map[ymd]) map[ymd] = []
        map[ymd].push(it)
    }
    for (const k of Object.keys(map)) {
        map[k].sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
    }
    return map
}

export default function Checkout() {
    const nav = useNavigate()
    const { state } = useLocation()
    const user = getUserFromToken()

    // Espera que PatientSchedule navegue con:
    // navigate("/paciente/checkout", {
    //   state: { doctorId, priceUSD, items: [{ start_at, end_at }, ...] }
    // })
    const doctorId = state?.doctorId || (user?.role === "doctor" ? user?.id : user?.doctor_id)
    const priceUSD = Number(state?.priceUSD ?? 0)
    const items = Array.isArray(state?.items) ? state.items : []

    const [holdMinutes] = React.useState(60)
    const [loading, setLoading] = React.useState(false)
    const [okMsg, setOkMsg] = React.useState("")
    const [errorMsg, setErrorMsg] = React.useState("")

    const total = (items.length * priceUSD).toFixed(2)
    const grouped = groupByDay(items)

    const disabled = loading || !doctorId || items.length === 0

    const goBack = () => nav(-1)

    const confirm = async () => {
        setOkMsg("")
        setErrorMsg("")
        if (disabled) return
        setLoading(true)
        try {
            // Crea los appointments en estado "processing" (bloqueados)
            // Método fijo "payphone" (único método)
            const payload = {
                doctor_id: doctorId,
                method: "payphone",
                hold_minutes: holdMinutes,
                slots: items.map((it) => ({ start_at: it.start_at, end_at: it.end_at })),
            }
            const res = await apiPost(`/appointments/hold`, payload)

            setOkMsg(
                `¡Listo! Se bloquearon ${res?.appointments?.length ?? items.length} horario(s) por ${holdMinutes} minutos.`
            )

            // Si quieres, puedes redirigir a una pantalla de “Pago” o “Resumen”:
            // nav("/paciente/pago", { state: { total, hold: res, priceUSD, doctorId } })
            console.log("HOLD RESPONSE:", res)
        } catch (e) {
            setErrorMsg(e?.message || "No se pudo bloquear temporalmente los horarios.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-emerald-800">Confirmar reserva</h1>
                    <p className="text-gray-600">Revisa tu selección y confirma el pago.</p>
                </div>
                <button
                    type="button"
                    onClick={goBack}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-gray-50 text-sm"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Volver
                </button>
            </div>

            {/* Resumen del carrito */}
            <section className="rounded-2xl bg-white p-5 border border-emerald-100 shadow-sm">
                <h2 className="font-semibold text-emerald-900">Tu carrito</h2>

                {items.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">No hay horarios seleccionados.</p>
                ) : (
                    <div className="mt-3 space-y-4">
                        {Object.keys(grouped)
                            .sort()
                            .map((ymd) => (
                                <div key={ymd}>
                                    <div className="text-sm font-medium text-gray-700">{ymd}</div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {grouped[ymd].map((it) => (
                                            <span
                                                key={`${it.start_at}-${it.end_at}`}
                                                className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-mono tabular-nums whitespace-nowrap"
                                            >
                                                {toLocalHM(it.start_at)}–{toLocalHM(it.end_at)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        <div className="pt-3 border-t flex items-center justify-between">
                            <div className="text-sm text-gray-700">
                                {items.length} {items.length === 1 ? "slot" : "slots"} × ${priceUSD.toFixed(2)}
                            </div>
                            <div className="text-lg font-semibold text-emerald-800">Total: ${total}</div>
                        </div>
                    </div>
                )}
            </section>

            {/* Info de bloqueo */}
            <section className="rounded-2xl bg-white p-5 border border-blue-100 shadow-sm">
                <h2 className="font-semibold text-blue-900">Pago con tarjeta</h2>
                <p className="text-sm text-gray-600 mt-1">
                    Al confirmar, tus horarios quedarán <strong>bloqueados por {holdMinutes} minutos</strong>. Este paso crea las
                    citas en estado <span className="font-mono">processing</span>. Luego conectaremos PayPhone para completar el
                    cobro.
                </p>
                <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="h-4 w-4" />
                    <span>Bloqueo temporal de los horarios: {holdMinutes} minutos.</span>
                </div>
            </section>

            {/* Mensajes */}
            {errorMsg && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2 text-sm">{errorMsg}</div>
            )}
            {okMsg && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">
                    {okMsg}
                </div>
            )}

            {/* Acciones */}
            <div className="flex items-center justify-end gap-3">
                <button
                    type="button"
                    onClick={goBack}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-gray-50"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Atrás
                </button>
                <button
                    type="button"
                    onClick={confirm}
                    disabled={disabled}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-60"
                >
                    <CreditCard className="h-4 w-4" />
                    Pagar ahora
                    <ArrowRight className="h-4 w-4" />
                </button>
            </div>
        </div>
    )
}
