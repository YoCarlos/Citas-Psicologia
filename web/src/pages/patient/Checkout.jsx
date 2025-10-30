// src/pages/paciente/Checkout.jsx
import React from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { apiPost } from "../../lib/api"
import { getUserFromToken } from "../../lib/auth"
import { ArrowLeft, ArrowRight, CreditCard, Clock } from "lucide-react"

const TZ = "America/Guayaquil"
const PAYPHONE_SCRIPT = "https://pay.payphonetodoesposible.com/api/button/js"
const PAYPHONE_PUBLIC_TOKEN = import.meta.env.VITE_PAYPHONE_TOKEN || "TU_TOKEN_PUBLICO"

// helpers de fecha
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

    // doctor: si viene en el state lo uso, si no, si soy doctor uso mi id, si soy paciente uso el doctor_id
    const doctorId =
        state?.doctorId || (user?.role === "doctor" ? user?.id : user?.doctor_id)

    const priceUSD = Number(state?.priceUSD ?? 0)
    const items = Array.isArray(state?.items) ? state.items : []

    // estado local
    const [holdMinutes] = React.useState(60)
    const [loading, setLoading] = React.useState(false)
    const [okMsg, setOkMsg] = React.useState("")
    const [errorMsg, setErrorMsg] = React.useState("")
    const [payReady, setPayReady] = React.useState(false)
    const [lastHold, setLastHold] = React.useState(null) // lo que devuelve /appointments/hold
    const payphoneDivRef = React.useRef(null)

    const total = (items.length * priceUSD).toFixed(2)
    const grouped = groupByDay(items)
    const disabled = loading || !doctorId || items.length === 0

    // 1) cargar script de PayPhone una sola vez
    React.useEffect(() => {
        const exists = document.querySelector(`script[src="${PAYPHONE_SCRIPT}"]`)
        if (exists) return
        const script = document.createElement("script")
        script.src = PAYPHONE_SCRIPT
        script.async = true
        document.body.appendChild(script)
    }, [])

    const goBack = () => nav(-1)

    // 2) callback cuando PayPhone diga "pago exitoso"
    const afterPaySuccess = async (payResp) => {
        // PayPhone puede llamarle distinto en cada integración, intentamos varias claves
        const payphoneId =
            payResp?.transactionId ||
            payResp?.id ||
            payResp?.payphoneId ||
            payResp?.paymentId ||
            "desconocido"

        const clientTx =
            payResp?.clientTransactionId || payResp?.reference || payResp?.id || null

        if (!lastHold) {
            setErrorMsg("Pago ok, pero no se encontró la cita bloqueada.")
            return
        }

        const appts = lastHold.appointments || []
        if (!appts.length) {
            setErrorMsg("Pago ok, pero no hay citas para confirmar.")
            return
        }

        try {
            // 1) confirmar cada cita en el backend
            for (const appt of appts) {
                await apiPost(`/appointments/${appt.id}/confirm`, {})
            }

            // 2) registrar el pago en /payments usando la primera cita
            const apptId = appts[0].id
            await apiPost(`/payments`, {
                appointment_id: apptId,
                method: "payphone",
                payphone_id: payphoneId,
                confirmed_by_doctor: true,
                client_transaction_id: clientTx, // opcional si tu backend lo soporta
            })

            setOkMsg("Pago registrado y cita(s) confirmada(s) ✅")
            setErrorMsg("")
            // aquí podrías redirigir:
            // nav("/paciente/citas")
        } catch (err) {
            console.error(err)
            setErrorMsg("Pago cobrado, pero no se pudo guardar en la API.")
        }
    }

    // 3) función que RENDERIZA la cajita de PayPhone dentro del div
    const renderPayphoneButton = (amountCents, refText = "cita-psico", holdId = null) => {
        // script aún no termina de cargar
        if (!window.payphone) {
            console.warn("PayPhone aún no está listo")
            return
        }
        if (!payphoneDivRef.current) return

        // limpiar contenido anterior
        payphoneDivRef.current.innerHTML = ""

        // que el clientTransactionId se pueda mapear con lo que guardamos en backend
        const clientTx = holdId ? `hold-${holdId}` : "tx-" + Date.now()

        window.payphone
            .Button({
                token: PAYPHONE_PUBLIC_TOKEN,
                amount: amountCents, // en centavos
                // si el servicio no lleva IVA, dejamos todo en amountWithoutTax
                amountWithoutTax: amountCents,
                amountWithTax: 0,
                reference: refText,
                clientTransactionId: clientTx,
                response: (resp) => {
                    console.log("✅ Pago exitoso PayPhone:", resp)
                    afterPaySuccess(resp)
                },
                error: (err) => {
                    console.error("❌ Error en pago:", err)
                    setErrorMsg("No se pudo completar el pago.")
                },
            })
            .render(payphoneDivRef.current.id)
    }

    // 4) botón "Pagar ahora" → primero llama a tu API para bloquear la cita
    const confirm = async () => {
        setOkMsg("")
        setErrorMsg("")
        if (disabled) return
        setLoading(true)
        try {
            const payload = {
                doctor_id: doctorId,
                method: "payphone",
                hold_minutes: holdMinutes,
                slots: items.map((it) => ({ start_at: it.start_at, end_at: it.end_at })),
            }

            // tu backend: POST /appointments/hold
            const res = await apiPost(`/appointments/hold`, payload)

            setLastHold(res)
            setOkMsg(
                `¡Listo! Se bloquearon ${(res?.appointments?.length ?? items.length)
                } horario(s) por ${holdMinutes} minutos. Ahora paga con PayPhone.`
            )
            setPayReady(true)

            // monto en centavos
            const amountCents = Math.round(Number(total) * 100)
            // referencia que se verá en el panel de PayPhone
            const holdId = res?.hold_id || Date.now()
            const refText = `cita-${holdId}`
            renderPayphoneButton(amountCents, refText, holdId)
        } catch (e) {
            console.error(e)
            setErrorMsg(
                e?.message || "No se pudo bloquear temporalmente los horarios."
            )
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

            {/* Resumen de horarios */}
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
                                {items.length} {items.length === 1 ? "slot" : "slots"} × $
                                {priceUSD.toFixed(2)}
                            </div>
                            <div className="text-lg font-semibold text-emerald-800">
                                Total: ${total}
                            </div>
                        </div>
                    </div>
                )}
            </section>

            {/* Info / ayuda */}
            <section className="rounded-2xl bg-white p-5 border border-blue-100 shadow-sm">
                <h2 className="font-semibold text-blue-900">Pago con tarjeta</h2>
                <p className="text-sm text-gray-600 mt-1">
                    Primero bloqueamos tu horario <strong>por {holdMinutes} minutos</strong> y luego
                    pagas con PayPhone. Al aprobarse el pago, se confirma la cita y se guarda el pago
                    en el sistema.
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

            {/* Contenedor donde PayPhone va a dibujar su botón/cajita */}
            <div
                id="payphone-btn-container"
                ref={payphoneDivRef}
                className={`${payReady ? "block" : "hidden"} rounded-xl bg-white border border-emerald-100 p-4`}
            />

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
