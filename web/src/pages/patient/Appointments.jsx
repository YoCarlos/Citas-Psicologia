// src/pages/paciente/PatientAppointments.jsx
import React from "react"
import { apiGet, apiPost } from "../../lib/api"
import { getUserFromToken } from "../../lib/auth"
import { ArrowRight, CalendarClock, Clock4, RotateCcw, Video, X, Info } from "lucide-react"

// =========================
// Zona horaria base
// =========================
const TZ = "America/Guayaquil"
const pad = (n) => String(n).padStart(2, "0")
const DEFAULT_LEAD_MINUTES = 60 // margen mínimo para mostrar slots al reagendar (1 hora)

// ------------------------------
// Helpers robustos de fecha/hora
// ------------------------------
const hasTZ = (s) => /Z$|[+\-]\d{2}:\d{2}$/.test(s || "")

/**
 * Interpreta cualquier ISO así:
 * - Si trae Z/offset => respeta el offset (ej. slots del backend con Z)
 * - Si NO trae zona  => trátalo como UTC agregando 'Z' (caso /appointments naive)
 */
const parseAny = (iso) => new Date(hasTZ(iso) ? iso : `${iso}Z`)

// Render siempre en GYE
const toLocalYMD = (iso) => {
    const d = parseAny(iso)
    const y = d.toLocaleString("en-CA", { year: "numeric", timeZone: TZ })
    const m = d.toLocaleString("en-CA", { month: "2-digit", timeZone: TZ })
    const day = d.toLocaleString("en-CA", { day: "2-digit", timeZone: TZ })
    return `${y}-${m}-${day}`
}

const toLocalHM = (iso) =>
    parseAny(iso).toLocaleTimeString("es-EC", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: TZ,
    })

// Inicio / fin del día **en GYE**
const startOfDayGYE = (ymd) => new Date(`${ymd}T00:00:00-05:00`)
const endOfDayGYE = (ymd) => new Date(`${ymd}T23:59:59-05:00`)

// "Ahora" en GYE como Date (pared horaria GYE)
const nowInGYE = () => {
    const y = Number(new Date().toLocaleString("en-CA", { year: "numeric", timeZone: TZ }))
    const m = Number(new Date().toLocaleString("en-CA", { month: "2-digit", timeZone: TZ }))
    const d = Number(new Date().toLocaleString("en-CA", { day: "2-digit", timeZone: TZ }))
    const hh = Number(new Date().toLocaleString("en-CA", { hour: "2-digit", hour12: false, timeZone: TZ }))
    const mm = Number(new Date().toLocaleString("en-CA", { minute: "2-digit", timeZone: TZ }))
    const ss = Number(new Date().toLocaleString("en-CA", { second: "2-digit", timeZone: TZ }))
    return new Date(`${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:${pad(ss)}-05:00`)
}

// Overlap [start,end) mezclando slots(Z) y citas(naive→UTC)
const overlapsMixed = (slotStartISO, slotEndISO, apptStartISO, apptEndISO) => {
    const s1 = parseAny(slotStartISO).getTime() // slot ya trae Z
    const s2 = parseAny(slotEndISO).getTime()
    const a1 = parseAny(apptStartISO).getTime() // naive -> UTC
    const a2 = parseAny(apptEndISO).getTime()
    return s1 < a2 && a1 < s2
}

// Habilitar “Unirse” 5 minutos antes (comparando en GYE para ventana)
const canJoinNow = (startISO, endISO) => {
    const now = nowInGYE()
    const start = parseAny(startISO)
    const end = parseAny(endISO)
    return now >= new Date(start.getTime() - 5 * 60000) && now <= end
}

// Regla de reagendar: >= 4 horas antes del inicio (comparado en GYE)
const canReschedule = (startISO) => {
    const now = nowInGYE()
    const start = parseAny(startISO)
    const diffHrs = (start - now) / 3600000
    return diffHrs >= 4
}

// ------------------------------
// UI helpers
// ------------------------------
function CleanModal({ open, onClose, title, children, footer }) {
    if (!open) return null
    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border">
                    <div className="p-5 border-b flex items-center justify-between">
                        <h4 className="text-lg font-semibold text-gray-800">{title}</h4>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="p-5">{children}</div>
                    {footer && <div className="p-4 border-t bg-gray-50 rounded-b-2xl">{footer}</div>}
                </div>
            </div>
        </div>
    )
}

const Banner = ({ kind = "info", children }) => {
    const styles = {
        info: "border-blue-200 bg-blue-50 text-blue-800",
        success: "border-emerald-200 bg-emerald-50 text-emerald-800",
        error: "border-rose-200 bg-rose-50 text-rose-700",
    }[kind]
    return (
        <div className={`rounded-lg border px-3 py-2 text-sm ${styles} flex items-start gap-2`}>
            <Info className="h-4 w-4 mt-0.5" />
            <div>{children}</div>
        </div>
    )
}

// ------------------------------
// Componente principal
// ------------------------------
export default function PatientAppointments() {
    const user = getUserFromToken()
    const patientId = user?.id

    const [loading, setLoading] = React.useState(false)
    const [errorMsg, setErrorMsg] = React.useState("")
    const [upcoming, setUpcoming] = React.useState([])
    const [past, setPast] = React.useState([])

    // --- Modal reagendar ---
    const [modalOpen, setModalOpen] = React.useState(false)
    const [resAppt, setResAppt] = React.useState(null)
    const [pickDay, setPickDay] = React.useState("") // YYYY-MM-DD (GYE)
    const [daySlots, setDaySlots] = React.useState([])
    const [slotsLoading, setSlotsLoading] = React.useState(false)
    const [slotsMsg, setSlotsMsg] = React.useState({ type: "", text: "" }) // info | success | error

    // Margen de antelación para mostrar slots al reagendar (sin /settings/booking)
    const [leadMinutes] = React.useState(DEFAULT_LEAD_MINUTES)

    // ---- Helpers de razones de bloqueo (tooltips y texto visible)
    const getRescheduleDisabledReason = (appt) => {
        if (!appt.canReschedule) return "Solo se puede reagendar hasta 4 horas antes del inicio."
        return ""
    }

    const getJoinDisabledReason = (appt) => {
        if (!appt.zoom_join_url) return "Aún no hay enlace de Zoom disponible."
        if (appt.status !== "confirmed") return "La sesión no está confirmada."
        return "El botón se habilita desde 5 minutos antes del inicio."
    }

    // Cargar citas del paciente
    const load = React.useCallback(async () => {
        if (!patientId) {
            setErrorMsg("No se encontró el paciente autenticado.")
            return
        }
        setLoading(true)
        setErrorMsg("")
        try {
            const all = await apiGet(`/appointments?patient_id=${patientId}`)
            const now = nowInGYE()

            const up = []
            const pa = []
            for (const a of all || []) {
                const start = parseAny(a.start_at) // naive->UTC, con Z respeta
                const end = parseAny(a.end_at)

                const item = {
                    ...a,
                    ymd: toLocalYMD(a.start_at),
                    timeLabel: `${toLocalHM(a.start_at)}–${toLocalHM(a.end_at)}`,
                    canJoin: a.status === "confirmed" && !!a.zoom_join_url && canJoinNow(a.start_at, a.end_at),
                    canReschedule: canReschedule(a.start_at),
                }
                if (end >= now) up.push(item)
                else pa.push(item)
            }
            // Orden estable (con el mismo parse)
            up.sort((a, b) => parseAny(a.start_at) - parseAny(b.start_at))
            pa.sort((a, b) => parseAny(b.start_at) - parseAny(a.start_at))

            setUpcoming(up)
            setPast(pa)
        } catch (e) {
            setErrorMsg(e?.message || "No se pudieron cargar tus citas.")
        } finally {
            setLoading(false)
        }
    }, [patientId])

    React.useEffect(() => {
        load()
    }, [load])

    // Abrir modal de reagendar con la fecha actual de la cita
    const openReschedule = async (appt) => {
        setSlotsMsg({ type: "", text: "" })
        setResAppt(appt)
        const ymd = toLocalYMD(appt.start_at)
        setPickDay(ymd)
        setModalOpen(true)
        await fetchDaySlots(appt.doctor_id, ymd, appt)
    }

    // Cargar slots del día (en GYE) aplicando margen y excluyendo ocupados/bloqueados
    const fetchDaySlots = async (doctorId, ymd, currentAppt = resAppt) => {
        setSlotsLoading(true)
        setSlotsMsg({ type: "info", text: "Buscando horarios disponibles…" })
        setDaySlots([])
        let isMounted = true
        try {
            const from = startOfDayGYE(ymd).toISOString()
            const to = endOfDayGYE(ymd).toISOString()

            // 1) Slots del día (vienen con Z)
            const qsSlots = new URLSearchParams({
                doctor_id: String(doctorId),
                date_from: from,
                date_to: to,
            }).toString()
            const resSlots = await apiGet(`/availability/slots?${qsSlots}`)

            // 2) Citas/bloqueos del doctor en esa ventana (naive -> UTC)
            let appts = []
            try {
                const qsAppts = new URLSearchParams({
                    doctor_id: String(doctorId),
                    date_from: from,
                    date_to: to,
                }).toString()
                appts = await apiGet(`/appointments?${qsAppts}`)
            } catch {
                appts = []
            }

            const now = nowInGYE()
            const blockers = (Array.isArray(appts) ? appts : [])
                .filter((a) => {
                    const st = (a.status || "").toLowerCase()
                    if (st === "confirmed") return true
                    if (st === "pending" || st === "processing") {
                        const hu = a.hold_until ? new Date(a.hold_until) : null
                        return hu && hu > now
                    }
                    return false
                })
                .map((a) => ({ start: a.start_at, end: a.end_at }))

            // 3) Filtros: margen + excluir el propio horario + excluir ocupados (mezclando TZ correctamente)
            const minStart = new Date(now.getTime() + DEFAULT_LEAD_MINUTES * 60000)
            const filtered = (resSlots || []).filter((s) => {
                const st = parseAny(s.start_at) // slot con Z -> ok
                if (st < minStart) return false
                if (currentAppt && overlapsMixed(s.start_at, s.end_at, currentAppt.start_at, currentAppt.end_at)) {
                    // mismo intervalo que la cita actual => descártalo
                    return false
                }
                if (blockers.some((b) => overlapsMixed(s.start_at, s.end_at, b.start, b.end))) return false
                return true
            })

            if (!isMounted) return
            setDaySlots(filtered)
            setSlotsMsg(
                filtered.length
                    ? { type: "info", text: `Elige un nuevo horario. *Se requiere al menos ${DEFAULT_LEAD_MINUTES} minuto(s) de antelación.*` }
                    : { type: "info", text: `No hay horarios disponibles en esta fecha con al menos ${DEFAULT_LEAD_MINUTES} minuto(s) de antelación.` }
            )
        } catch (e) {
            if (!isMounted) return
            setSlotsMsg({ type: "error", text: e?.message || "No se pudieron cargar los horarios." })
        } finally {
            if (isMounted) setSlotsLoading(false)
        }
        return () => { isMounted = false }
    }

    // Click en un slot => reagendar
    const onPickSlot = async (slot) => {
        if (!resAppt) return
        if (!canReschedule(resAppt.start_at)) {
            setSlotsMsg({ type: "error", text: "No puedes reagendar: faltan menos de 4 horas para tu cita." })
            return
        }
        try {
            await apiPost(`/appointments/${resAppt.id}/reschedule`, {
                start_at: slot.start_at,
                end_at: slot.end_at,
            })
            setSlotsMsg({ type: "success", text: "¡Listo! Tu cita fue reagendada." })
            // Refrescar lista
            await load()
        } catch (e) {
            setSlotsMsg({
                type: "error",
                text: e?.message || "No se pudo reagendar. Ese horario pudo haberse ocupado mientras elegías.",
            })
        }
    }

    // Unirse (abre Zoom si confirmado y dentro de ventana)
    const onJoin = (appt) => {
        if (!appt.canJoin) return
        window.open(appt.zoom_join_url, "_blank", "noopener")
    }

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-bold text-blue-800">Mis citas</h2>

            {errorMsg && <Banner kind="error">{errorMsg}</Banner>}

            {/* Próximas */}
            <div className="rounded-2xl bg-white border p-5">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-emerald-800">Próximas</h3>
                    <div className="text-sm text-gray-500 flex items-center gap-2">
                        <CalendarClock className="h-4 w-4" />
                        {upcoming.length} cita(s)
                    </div>
                </div>

                {loading ? (
                    <div className="mt-4 text-sm text-gray-500">Cargando…</div>
                ) : (
                    <div className="mt-4 divide-y">
                        {upcoming.length === 0 && <div className="text-sm text-gray-500">Sin próximas citas.</div>}
                        {upcoming.map((a) => {
                            const reschDisabled = !a.canReschedule
                            const reschReason = getRescheduleDisabledReason(a)

                            const joinDisabled = !a.canJoin
                            const joinReason = getJoinDisabledReason(a)

                            return (
                                <div key={a.id} className="py-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            {/* Fecha y hora (formateadas en GYE) */}
                                            <div className="font-medium">
                                                <span className="text-gray-800">{a.ymd}</span>{" "}
                                                <span className="text-blue-700 font-mono tabular-nums">{a.timeLabel}</span>
                                            </div>
                                            <div className="text-xs text-gray-500">Estado: {a.status}</div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => openReschedule(a)}
                                                disabled={reschDisabled}
                                                className={[
                                                    "px-3 py-1.5 rounded-lg border text-sm inline-flex items-center gap-2",
                                                    reschDisabled ? "text-gray-400 cursor-not-allowed opacity-60" : "text-gray-700 hover:bg-gray-50",
                                                ].join(" ")}
                                                title={reschDisabled ? reschReason : "Reagendar"}
                                                aria-disabled={reschDisabled ? "true" : "false"}
                                            >
                                                <RotateCcw className="h-4 w-4" /> Reagendar
                                            </button>

                                            <button
                                                onClick={() => onJoin(a)}
                                                disabled={joinDisabled}
                                                className={[
                                                    "px-3 py-1.5 rounded-lg text-sm inline-flex items-center gap-2",
                                                    joinDisabled ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-blue-700 text-white hover:bg-blue-800",
                                                ].join(" ")}
                                                title={joinDisabled ? joinReason : "Unirse a la sesión"}
                                                aria-disabled={joinDisabled ? "true" : "false"}
                                            >
                                                <Video className="h-4 w-4" /> Unirse
                                            </button>
                                        </div>
                                    </div>

                                    {/* Razones visibles cuando están bloqueados */}
                                    {(reschDisabled || joinDisabled) && (
                                        <div className="mt-2 flex flex-col gap-1">
                                            {reschDisabled && (
                                                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 inline-flex items-center gap-1 w-fit">
                                                    <Info className="h-3.5 w-3.5" />
                                                    {reschReason}
                                                </div>
                                            )}
                                            {joinDisabled && (
                                                <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 inline-flex items-center gap-1 w-fit">
                                                    <Info className="h-3.5 w-3.5" />
                                                    {joinReason}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}

                <div className="mt-3 text-xs text-gray-500">
                    * Puedes reagendar hasta 4 horas antes del inicio. Los horarios de cambio requieren {DEFAULT_LEAD_MINUTES} minuto(s) de antelación como mínimo.
                </div>
            </div>

            {/* Pasadas */}
            <div className="rounded-2xl bg-white border p-5">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-800">Pasadas</h3>
                    <div className="text-sm text-gray-500">{past.length} cita(s)</div>
                </div>
                <div className="mt-4 divide-y">
                    {past.length === 0 && <div className="text-sm text-gray-500">No hay citas pasadas.</div>}
                    {past.map((a) => (
                        <div key={a.id} className="py-3 flex items-center justify-between">
                            <div>
                                <div className="font-medium">
                                    <span className="text-gray-800">{a.ymd}</span>{" "}
                                    <span className="text-blue-700 font-mono tabular-nums">{a.timeLabel}</span>
                                </div>
                                <div className="text-xs text-gray-500">Estado: {a.status}</div>
                            </div>
                            <button className="px-3 py-1.5 rounded-lg border text-gray-700 hover:bg-gray-50 text-sm inline-flex items-center gap-2">
                                <Clock4 className="h-4 w-4" /> Ver detalle
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Modal Reagendar */}
            <CleanModal
                open={modalOpen}
                onClose={() => {
                    setModalOpen(false)
                    setResAppt(null)
                    setDaySlots([])
                    setSlotsMsg({ type: "", text: "" })
                }}
                title="Reagendar cita"
                footer={
                    <div className="text-xs text-gray-500">
                        Solo puedes reagendar hasta 4 horas antes del inicio. Los horarios disponibles respetan un margen mínimo de {DEFAULT_LEAD_MINUTES} minuto(s) de antelación.
                    </div>
                }
            >
                {!resAppt ? (
                    <div className="text-sm text-gray-500">Selecciona una cita para reagendar.</div>
                ) : (
                    <div className="space-y-4">
                        <div className="rounded-lg border p-3 bg-gray-50">
                            <div className="text-sm text-gray-700">
                                Cita actual:&nbsp;
                                <strong>
                                    <span className="text-gray-800">{toLocalYMD(resAppt.start_at)}</span>{" "}
                                    <span className="text-blue-700 font-mono tabular-nums">
                                        {toLocalHM(resAppt.start_at)}–{toLocalHM(resAppt.end_at)}
                                    </span>
                                </strong>
                                &nbsp;• Estado: {resAppt.status}
                            </div>
                            {!resAppt.canReschedule && (
                                <div className="mt-2">
                                    <Banner kind="error">No puedes reagendar: faltan menos de 4 horas para tu cita.</Banner>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            <label className="text-sm font-medium text-gray-700">Fecha</label>
                            <input
                                type="date"
                                className="px-3 py-2 rounded-lg border text-sm"
                                value={pickDay}
                                onChange={(e) => {
                                    const ymd = e.target.value
                                    setPickDay(ymd)
                                    if (resAppt) fetchDaySlots(resAppt.doctor_id, ymd, resAppt)
                                }}
                                min={toLocalYMD(nowInGYE().toISOString())}
                            />
                        </div>

                        {slotsMsg.text && (
                            <Banner kind={slotsMsg.type === "success" ? "success" : slotsMsg.type === "error" ? "error" : "info"}>
                                {slotsMsg.text}
                            </Banner>
                        )}

                        {/* Lista de slots del día */}
                        <div className="min-h-[56px]">
                            {slotsLoading ? (
                                <div className="text-sm text-gray-500">Cargando horarios…</div>
                            ) : (
                                <>
                                    {daySlots.length === 0 ? (
                                        <div className="text-sm text-gray-500">
                                            No hay horarios disponibles con al menos {DEFAULT_LEAD_MINUTES} minuto(s) de antelación.
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                            {daySlots.map((s) => {
                                                const disabled = !resAppt?.canReschedule
                                                return (
                                                    <button
                                                        key={`${s.start_at}-${s.end_at}`}
                                                        onClick={() => !disabled && onPickSlot(s)}
                                                        disabled={disabled}
                                                        className={[
                                                            "px-3 py-2 rounded-lg border text-sm font-mono tabular-nums inline-flex items-center gap-2",
                                                            disabled
                                                                ? "border-gray-200 text-gray-400 cursor-not-allowed"
                                                                : "border-emerald-200 text-emerald-800 hover:bg-emerald-50",
                                                        ].join(" ")}
                                                        title={disabled ? "No puedes reagendar: faltan menos de 4 horas para tu cita." : "Elegir este horario"}
                                                        aria-disabled={disabled ? "true" : "false"}
                                                    >
                                                        <Clock4 className="h-4 w-4" />
                                                        {toLocalHM(s.start_at)}–{toLocalHM(s.end_at)}
                                                        {!disabled && <ArrowRight className="h-4 w-4" />}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </CleanModal>
        </div>
    )
}
