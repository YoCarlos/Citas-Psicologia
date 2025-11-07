// src/pages/paciente/Checkout.jsx
import React from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { apiPost } from "../../lib/api"
import { getUserFromToken } from "../../lib/auth"
import { ArrowLeft, ArrowRight, CreditCard, Clock, Info } from "lucide-react"

// === PayPhone Cajita v1.1 (OFICIAL) ===
const PAYPHONE_BOX_JS =
    import.meta.env.VITE_PAYPHONE_BOX_JS ||
    "https://cdn.payphonetodoesposible.com/box/v1.1/payphone-payment-box.js"
const PAYPHONE_BOX_CSS =
    import.meta.env.VITE_PAYPHONE_BOX_CSS ||
    "https://cdn.payphonetodoesposible.com/box/v1.1/payphone-payment-box.css"
const PAYPHONE_PUBLIC_TOKEN = import.meta.env.VITE_PAYPHONE_TOKEN || "" // requerido
const PAYPHONE_STORE_ID = import.meta.env.VITE_PAYPHONE_STORE_ID || ""  // requerido

const TZ = "America/Guayaquil"

// helpers de fecha (solo UI)
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

    const doctorId =
        state?.doctorId || (user?.role === "doctor" ? user?.id : user?.doctor_id)
    const priceUSD = Number(state?.priceUSD ?? 0)
    const items = Array.isArray(state?.items) ? state.items : []
    const totalUSD = items.length * priceUSD
    const amountCents = Math.round(totalUSD * 100)

    const [holdMinutes] = React.useState(60)
    const [loading, setLoading] = React.useState(false)
    const [okMsg, setOkMsg] = React.useState("")
    const [errorMsg, setErrorMsg] = React.useState("")
    const [payReady, setPayReady] = React.useState(false)
    const [lastHold, setLastHold] = React.useState(null)
    const [sdkReady, setSdkReady] = React.useState(false)
    const [sdkLog, setSdkLog] = React.useState([])

    const grouped = groupByDay(items)
    const disabled = loading || !doctorId || items.length === 0

    const log = React.useCallback((...args) => {
        console.log("[PAYPHONE]", ...args)
        setSdkLog((prev) => [...prev, args.map(String).join(" ")].slice(-10))
    }, [])

    // === Cargar SDK ===
    React.useEffect(() => {
        // CSS
        if (!document.querySelector(`link[href="${PAYPHONE_BOX_CSS}"]`)) {
            const link = document.createElement("link")
            link.rel = "stylesheet"
            link.href = PAYPHONE_BOX_CSS
            document.head.appendChild(link)
        }
        // JS
        if (!document.querySelector(`script[src="${PAYPHONE_BOX_JS}"]`)) {
            const s = document.createElement("script")
            s.type = "module"
            s.src = PAYPHONE_BOX_JS
            s.onload = () => {
                setTimeout(() => {
                    const ok =
                        typeof window.PPaymentButtonBox === "function" ||
                        typeof globalThis.PPaymentButtonBox === "function"
                    setSdkReady(ok)
                    log("SDK cargado correctamente:", ok)
                }, 100)
            }
            s.onerror = () => setErrorMsg("No se pudo cargar el SDK de PayPhone.")
            document.body.appendChild(s)
        } else {
            const ok =
                typeof window.PPaymentButtonBox === "function" ||
                typeof globalThis.PPaymentButtonBox === "function"
            setSdkReady(ok)
        }
    }, [log])

    const goBack = () => nav(-1)

    // === Renderizar Cajita (campos mínimos según ejemplo oficial) ===
    const renderPayphoneBox = React.useCallback(
        (opts) => {
            const PPB = window.PPaymentButtonBox || globalThis.PPaymentButtonBox
            if (!PPB) {
                log("SDK no disponible todavía")
                return false
            }
            const container = document.getElementById("pp-button")
            if (!container) return false
            container.innerHTML = ""

            try {
                new PPB({
                    token: PAYPHONE_PUBLIC_TOKEN,
                    clientTransactionId: opts.clientTransactionId, // ID único de esta transacción
                    amount: opts.amount,                // total en centavos
                    amountWithoutTax: opts.amount,      // todo sin IVA (ajusta si usas impuestos)
                    amountWithTax: 0,
                    tax: 0,
                    currency: "USD",
                    storeId: PAYPHONE_STORE_ID,
                    reference: opts.reference || "Cita Psicología",
                    // opcionales no críticos: puedes enviar IDs para reconciliar en el return
                    optionalParameter3: (opts.appointmentIds || []).join(","),
                }).render("pp-button")

                log("Cajita renderizada con clientTx:", opts.clientTransactionId)
                return true
            } catch (e) {
                console.error(e)
                setErrorMsg("No se pudo inicializar la cajita de pagos.")
                return false
            }
        },
        [log]
    )

    // === Flujo: HOLD + render Cajita ===
    const confirm = async () => {
        setOkMsg("")
        setErrorMsg("")
        if (disabled) return
        setLoading(true)

        try {
            // 1) BLOQUEAR HORARIOS
            const payload = {
                doctor_id: doctorId,
                method: "payphone",
                hold_minutes: holdMinutes,
                slots: items.map((it) => ({ start_at: it.start_at, end_at: it.end_at })),
            }
            log("POST /appointments/hold", payload)
            const res = await apiPost(`/appointments/hold`, payload)

            if (!res?.appointments?.length) {
                throw new Error("El servidor no devolvió citas.")
            }

            setLastHold(res)
            const appointmentIds = res.appointments.map((a) => a.id)
            const holdCount = appointmentIds.length
            setOkMsg(`Se bloquearon ${holdCount} horario(s) por ${holdMinutes} minutos. Procede al pago.`)
            setPayReady(true)

            // 2) CLIENT TX (lo generamos aquí; el backend confirmará por return URL)
            const clientTx = `tx-${Date.now()}-${Math.floor(Math.random() * 9999)}`
            const refText = `cita-${clientTx}`

            if (!sdkReady) await new Promise((r) => setTimeout(r, 200))

            const ok = renderPayphoneBox({
                amount: amountCents,
                reference: refText,
                clientTransactionId: clientTx,
                appointmentIds,
            })

            if (!ok) setErrorMsg("No se pudo mostrar la cajita de pagos.")
        } catch (e) {
            console.error(e)
            setErrorMsg(e?.message || "No se pudo bloquear temporalmente los horarios.")
            setPayReady(false)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
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

            {/* Resumen */}
            <section className="rounded-2xl bg-white p-5 border border-emerald-100 shadow-sm">
                <h2 className="font-semibold text-emerald-900">Tu carrito</h2>
                {items.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">No hay horarios seleccionados.</p>
                ) : (
                    <div className="mt-3 space-y-4">
                        {Object.keys(grouped).sort().map((ymd) => (
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
                            <div className="text-lg font-semibold text-emerald-800">Total: ${totalUSD.toFixed(2)}</div>
                        </div>
                    </div>
                )}
            </section>

            {/* Info */}
            <section className="rounded-2xl bg-white p-5 border border-blue-100 shadow-sm">
                <h2 className="font-semibold text-blue-900">Pago con tarjeta</h2>
                <p className="text-sm text-gray-600 mt-1">
                    Primero bloqueamos tu horario <strong>por {holdMinutes} minutos</strong> y luego pagas con PayPhone.
                    La Cajita se mostrará abajo.
                </p>
                <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="h-4 w-4" />
                    <span>Bloqueo temporal de los horarios: {holdMinutes} minutos.</span>
                </div>
            </section>

            {/* Mensajes */}
            {errorMsg && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2 text-sm">
                    {errorMsg}
                </div>
            )}
            {okMsg && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">
                    {okMsg}
                </div>
            )}

            {/* Debug */}
            <div className="rounded-lg border px-3 py-2 text-xs text-gray-700 bg-gray-50">
                <div className="flex items-center gap-2">
                    <Info className="h-3.5 w-3.5" />
                    <span className="font-medium">DEBUG PayPhone</span>
                </div>
                <div className="mt-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-y-1">
                    <div>SDK listo: <strong>{sdkReady ? "sí" : "no"}</strong></div>
                    <div>Token: <strong>{PAYPHONE_PUBLIC_TOKEN ? "ok" : "faltante"}</strong></div>
                    <div>StoreId: <strong>{PAYPHONE_STORE_ID ? "ok" : "faltante"}</strong></div>
                    <div>Monto (¢): <strong>{amountCents}</strong></div>
                    <div>Dominio: <strong>{location.host}</strong></div>
                    {lastHold?.appointments && (
                        <div>IDs: <strong>{lastHold.appointments.map((a) => a.id).join(", ")}</strong></div>
                    )}
                </div>
                {sdkLog.length > 0 && (
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap">
                        {sdkLog.map((l, i) => `• ${l}`).join("\n")}
                    </pre>
                )}
            </div>

            {/* Contenedor cajita */}
            <div id="pp-button" className={`${payReady ? "block" : "hidden"} rounded-xl bg-white border border-emerald-100 p-4`} />

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
