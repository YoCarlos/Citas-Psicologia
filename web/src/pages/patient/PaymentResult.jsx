// src/pages/paciente/Checkout.jsx
import React from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { apiPost } from "../../lib/api"
import { getUserFromToken } from "../../lib/auth"
import { ArrowLeft, ArrowRight, CreditCard, Clock } from "lucide-react"

const TZ = "America/Guayaquil"
const PAYPHONE_SCRIPT = "https://pay.payphonetodoesposible.com/api/button/js"
const PAYPHONE_PUBLIC_TOKEN = import.meta.env.VITE_PAYPHONE_TOKEN || "TU_TOKEN_PUBLICO"

// ---------- Helpers de fecha ----------
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

// ---------- Carga robusta del script PayPhone ----------
function loadPayphoneScript() {
    return new Promise((resolve, reject) => {
        if (window.payphone) return resolve(window.payphone)

        const existing = document.querySelector(`script[src="${PAYPHONE_SCRIPT}"]`)
        if (!existing) {
            const s = document.createElement("script")
            s.src = PAYPHONE_SCRIPT
            s.async = true
            s.onerror = () => reject(new Error("No se pudo cargar el script de PayPhone"))
            document.body.appendChild(s)
        }

        const started = Date.now()
        const timer = setInterval(() => {
            if (window.payphone) {
                clearInterval(timer)
                resolve(window.payphone)
            } else if (Date.now() - started > 7000) {
                clearInterval(timer)
                reject(new Error("PayPhone no inicializó a tiempo"))
            }
        }, 150)
    })
}

export default function Checkout() {
    const nav = useNavigate()
    const { state } = useLocation()
    const user = getUserFromToken()

    // Espera que PatientSchedule navegue con:
    // state: { doctorId, priceUSD, items: [{ start_at, end_at }, ...] }
    const doctorId = state?.doctorId || (user?.role === "doctor" ? user?.id : user?.doctor_id)
    const priceUSD = Number(state?.priceUSD ?? 0)
    const items = Array.isArray(state?.items) ? state.items : []

    const [holdMinutes] = React.useState(60)
    const [loading, setLoading] = React.useState(false)
    const [okMsg, setOkMsg] = React.useState("")
    const [errorMsg, setErrorMsg] = React.useState("")
    const [payReady, setPayReady] = React.useState(false)
    const [lastHold, setLastHold] = React.useState(null)       // respuesta de /appointments/hold
    const [payLoading, setPayLoading] = React.useState(false)  // spinner de la cajita

    const payphoneDivRef = React.useRef(null)

    const total = (items.length * priceUSD).toFixed(2)
    const grouped = groupByDay(items)
    const disabled = loading || !doctorId || items.length === 0

    // Cargar script al montar (por si el usuario llega directo)
    React.useEffect(() => {
        loadPayphoneScript().catch((e) => console.error(e))
    }, [])

    const goBack = () => nav(-1)

    // --------- Después del pago: confirmar cita(s) + guardar pago ----------
    const afterPaySuccess = async (payResp) => {
        // De PayPhone suele venir algo como: { transactionId, id, ... }
        const payphoneId =
            payResp?.transactionId ||
            payResp?.id ||
            payResp?.payphoneId ||
            payResp?.paymentId ||
            "desconocido"

        if (!lastHold) {
            setErrorMsg("Pago aprobado, pero no se encontró la reserva para confirmar.")
            return
        }

        const appts = lastHold.appointments || []
        if (!appts.length) {
            setErrorMsg("Pago aprobado, pero no hay citas para confirmar.")
            return
        }

        try {
            // 1) confirmar cada cita
            for (const appt of appts) {
                await apiPost(`/appointments/${appt.id}/confirm`, {})
            }

            // 2) registrar el pago (toma la primera cita como referencia principal)
            const apptId = appts[0].id
            await apiPost(`/payments`, {
                appointment_id: apptId,
                method: "payphone",
                payphone_id: payphoneId,
                confirmed_by_doctor: true, // como indicaste: siempre true
            })

            setOkMsg("Pago registrado y cita(s) confirmada(s) ✅")
            setErrorMsg("")
            // Opcional: redirigir a "mis citas"
            // nav("/paciente/citas")
        } catch (err) {
            console.error(err)
            setErrorMsg("Pago cobrado, pero no se pudo guardar/confirmar en la API.")
        }
    }

    // --------- Render del botón PayPhone ----------
    const renderPayphoneButton = async (amountCents, refText = "cita-psico") => {
        if (!payphoneDivRef.current) return
        if (!Number.isFinite(amountCents) || amountCents <= 0) {
            setErrorMsg("El monto del pago no es válido.")
            return
        }

        setPayLoading(true)
        try {
            await loadPayphoneScript() // garantiza window.payphone
            // limpiar cualquier render previo
            payphoneDivRef.current.innerHTML = ""

            window
                .payphone
                .Button({
                    token: PAYPHONE_PUBLIC_TOKEN,  // ⚠️ token público
                    amount: amountCents,
                    amountWithoutTax: 0,
                    amountWithTax: amountCents,
                    reference: refText,
                    clientTransactionId: "tx-" + Date.now(),
                    response: (resp) => {
                        console.log("✅ Pago exitoso PayPhone:", resp)
                        setPayLoading(false)
                        afterPaySuccess(resp)
                    },
                    error: (err) => {
                        console.error("❌ Error en pago:", err)
                        setPayLoading(false)
                        setErrorMsg("No se pudo completar el pago.")
                    },
                })
                // Importante: pasar el *id* del contenedor (sin '#')
                .render(payphoneDivRef.current.id)
        } catch (e) {
            console.error(e)
            setErrorMsg("No se pudo inicializar la cajita de PayPhone.")
        } finally {
            // si el usuario cierra la cajita sin pagar, PayPhone no dispara 'error', mantenemos spinner off
            setPayLoading(false)
        }
    }

    // --------- Click en "Pagar ahora" ----------
    const confirm = async () => {
        setOkMsg("")
        setErrorMsg("")
        if (disabled) return
        setLoading(true)
        try {
            // 1) Bloquear horarios (hold)
            const payload = {
                doctor_id: doctorId,
                method: "payphone",
                hold_minutes: holdMinutes,
                slots: items.map((it) => ({ start_at: it.start_at, end_at: it.end_at })),
            }
            const res = await apiPost(`/appointments/hold`, payload)
            setLastHold(res)

            setOkMsg(
                `¡Listo! Se bloquearon ${(res?.appointments?.length ?? items.length)} horario(s) por ${holdMinutes} minutos. Ahora paga con PayPhone.`
            )
            setPayReady(true)

            // 2) Montar cajita PayPhone
            const amountCents = Math.round(Number(total) * 100)
            const refText = `cita-${res?.hold_id || Date.now()}`
            await renderPayphoneButton(amountCents, refText)
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

            {/* Info de bloqueo y pago */}
            <section className="rounded-2xl bg-white p-5 border border-blue-100 shadow-sm">
                <h2 className="font-semibold text-blue-900">Pago con tarjeta</h2>
                <p className="text-sm text-gray-600 mt-1">
                    Primero bloqueamos tu horario <strong>por {holdMinutes} minutos</strong> y luego pagas con PayPhone.
                    Al aprobarse el pago, confirmamos la(s) cita(s) y registramos el pago.
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

            {/* Contenedor del botón de PayPhone */}
            <div
                id="payphone-btn-container"
                ref={payphoneDivRef}
                className={`${payReady ? "block" : "hidden"} rounded-xl bg-white border border-emerald-100 p-4`}
            >
                {/* Spinner mientras preparamos la cajita */}
                {payLoading && (
                    <div className="flex items-center gap-3 text-sm text-gray-600">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
                            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" />
                        </svg>
                        Preparando PayPhone…
                    </div>
                )}
            </div>

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
