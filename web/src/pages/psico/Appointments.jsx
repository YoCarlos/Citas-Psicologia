// src/pages/doctora/Appointments.jsx
import React from "react"
import { apiGet, apiPost } from "../../lib/api"
import { getUserFromToken } from "../../lib/auth"
import { CalendarClock, Video, RefreshCw, CalendarDays, X, Eye, EyeOff, Filter } from "lucide-react"

const TZ = "America/Guayaquil"

// === TZ helpers (GYE) ===
const parseAsGYE = (iso) => {
    if (!iso) return null
    if (iso.includes("Z") || (iso.includes("+") && iso.length > 19)) return new Date(iso)
    return new Date(`${iso}-05:00`)
}
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

const nowInGYE = () => {
    const base = new Date()
    const y = base.toLocaleString("en-CA", { year: "numeric", timeZone: TZ })
    const m = base.toLocaleString("en-CA", { month: "2-digit", timeZone: TZ })
    const d = base.toLocaleString("en-CA", { day: "2-digit", timeZone: TZ })
    const hh = base.toLocaleString("en-CA", { hour: "2-digit", hour12: false, timeZone: TZ })
    const mm = base.toLocaleString("en-CA", { minute: "2-digit", timeZone: TZ })
    const ss = base.toLocaleString("en-CA", { second: "2-digit", timeZone: TZ })
    return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}-05:00`)
}
const canJoinNow = (startISO, endISO) => {
    const now = nowInGYE()
    const start = parseAsGYE(startISO)
    const end = parseAsGYE(endISO)
    return now >= new Date(start.getTime() - 5 * 60000) && now <= end
}

// ==== rangos de filtro (en GYE) ====
const startOfToday = () => {
    const n = nowInGYE()
    return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}
const endOfToday = () => new Date(startOfToday().getTime() + 24 * 60 * 60000 - 1)

const startOfWeek = () => {
    const n = startOfToday()
    // semana lun-dom en GYE
    const jsDay = (n.getDay() + 6) % 7 // Mon=0..Sun=6
    n.setDate(n.getDate() - jsDay)
    return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}
const endOfWeek = () => new Date(startOfWeek().getTime() + 7 * 24 * 60 * 60000 - 1)

const addDays = (d, days) => new Date(d.getTime() + days * 24 * 60 * 60000)

export default function Appointments() {
    const user = getUserFromToken()
    const doctorId = user?.id

    const [loading, setLoading] = React.useState(false)
    const [errorMsg, setErrorMsg] = React.useState("")
    const [items, setItems] = React.useState([])

    // visibilidad
    const [showPast, setShowPast] = React.useState(false)

    // filtros rápidos
    const [range, setRange] = React.useState("today") // today | week | next30 | all

    // Modal reagendar
    const [modalOpen, setModalOpen] = React.useState(false)
    const [currentAppt, setCurrentAppt] = React.useState(null)
    const [pickDate, setPickDate] = React.useState("") // YYYY-MM-DD
    const [slots, setSlots] = React.useState([])
    const [slotsLoading, setSlotsLoading] = React.useState(false)
    const [modalMsg, setModalMsg] = React.useState("")

    const load = React.useCallback(async () => {
        if (!doctorId) {
            setErrorMsg("No se encontró la doctora autenticada.")
            return
        }
        setLoading(true)
        setErrorMsg("")
        try {
            const res = await apiGet(`/appointments?doctor_id=${doctorId}&limit=500`)
            const now = nowInGYE()
            const mapped = (res || []).map((a) => {
                const isPast = parseAsGYE(a.end_at) < now
                return {
                    ...a,
                    ymd: toLocalYMD(a.start_at),
                    time: `${toLocalHM(a.start_at)}–${toLocalHM(a.end_at)}`,
                    isPast,
                    canJoin: a.status === "confirmed" && !!a.zoom_join_url && canJoinNow(a.start_at, a.end_at),
                }
            })
            mapped.sort((x, y) => new Date(x.start_at) - new Date(y.start_at))
            setItems(mapped)
        } catch (e) {
            setErrorMsg(e?.message || "No se pudieron cargar las citas.")
        } finally {
            setLoading(false)
        }
    }, [doctorId])

    React.useEffect(() => {
        load()
    }, [load])

    // aplicar filtros
    const filteredByRange = React.useMemo(() => {
        if (range === "all") return items
        if (items.length === 0) return items

        let from = null
        let to = null

        if (range === "today") {
            from = startOfToday()
            to = endOfToday()
        } else if (range === "week") {
            from = startOfWeek()
            to = endOfWeek()
        } else if (range === "next30") {
            const s = startOfToday()
            from = s
            to = addDays(s, 30)
        }

        if (!from || !to) return items

        return items.filter((a) => {
            const start = parseAsGYE(a.start_at)
            return start >= from && start <= to
        })
    }, [items, range])

    // ocultar pasadas si corresponde
    const visible = React.useMemo(
        () => filteredByRange.filter((a) => (showPast ? true : !a.isPast)),
        [filteredByRange, showPast]
    )

    // agrupar por día
    const grouped = React.useMemo(() => {
        const map = {}
        for (const a of visible) {
            if (!map[a.ymd]) map[a.ymd] = []
            map[a.ymd].push(a)
        }
        for (const k of Object.keys(map)) {
            map[k].sort((x, y) => new Date(x.start_at) - new Date(y.start_at))
        }
        return Object.entries(map).sort((a, b) => new Date(a[0]) - new Date(b[0]))
    }, [visible])

    const statusBadge = (status) => {
        if (status === "confirmed") return "bg-emerald-100 text-emerald-700"
        if (status === "pending") return "bg-yellow-100 text-yellow-800"
        if (status === "free") return "bg-gray-100 text-gray-700"
        return "bg-gray-100 text-gray-700"
    }

    // --- Modal Reagendar ---
    const openReschedule = (appt) => {
        setCurrentAppt(appt)
        setPickDate(toLocalYMD(appt.start_at))
        setSlots([])
        setModalMsg("")
        setModalOpen(true)
        const now = nowInGYE()
        const start = parseAsGYE(appt.start_at)
        const locked = (start.getTime() - now.getTime()) / 36e5 < 4
        if (!locked) {
            setTimeout(() => fetchSlotsForDay(toLocalYMD(appt.start_at)), 0)
        }
    }

    const fetchSlotsForDay = async (ymd) => {
        if (!currentAppt) return
        setSlotsLoading(true)
        setModalMsg("")
        try {
            const from = new Date(`${ymd}T00:00:00-05:00`).toISOString()
            const to = new Date(`${ymd}T23:59:59-05:00`).toISOString()
            const qs = new URLSearchParams({
                doctor_id: String(doctorId),
                date_from: from,
                date_to: to,
            }).toString()
            const res = await apiGet(`/availability/slots?${qs}`)
            const sorted = (res || []).sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
            setSlots(sorted)
            if (sorted.length === 0) setModalMsg("No hay horarios disponibles para esta fecha.")
        } catch (e) {
            setModalMsg(e?.message || "No se pudo cargar la disponibilidad para ese día.")
        } finally {
            setSlotsLoading(false)
        }
    }

    const onDateChange = (e) => {
        const ymd = e.target.value
        setPickDate(ymd)
        setSlots([])
        setModalMsg("")
        if (!currentAppt) return
        const now = nowInGYE()
        const start = parseAsGYE(currentAppt.start_at)
        const locked = (start.getTime() - now.getTime()) / 36e5 < 4
        if (!locked && ymd) fetchSlotsForDay(ymd)
    }

    const tryReschedule = async (slot) => {
        if (!currentAppt) return
        setModalMsg("")
        const now = nowInGYE()
        const start = parseAsGYE(currentAppt.start_at)
        const locked = (start.getTime() - now.getTime()) / 36e5 < 4
        if (locked) {
            setModalMsg("No es posible reagendar: faltan menos de 4 horas para el inicio de la cita.")
            return
        }
        try {
            await apiPost(`/appointments/${currentAppt.id}/reschedule`, {
                start_at: slot.start_at,
                end_at: slot.end_at,
            })
            setModalMsg("¡Listo! La cita fue reagendada correctamente.")
            await load()
        } catch (e) {
            setModalMsg(e?.message || "No se pudo reagendar la cita.")
        }
    }

    const onJoin = (appt) => {
        if (!appt.canJoin) return
        window.open(appt.zoom_join_url, "_blank", "noopener")
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl font-bold text-blue-800">Citas</h2>

                <div className="flex flex-wrap items-center gap-2">
                    {/* Filtros rápidos */}
                    <div className="inline-flex items-center gap-2 px-2 py-1 rounded-lg border text-sm">
                        <Filter className="h-4 w-4 text-gray-500" />
                        <button
                            className={`px-2 py-1 rounded-md ${range === "today" ? "bg-blue-600 text-white" : "hover:bg-gray-100"}`}
                            onClick={() => setRange("today")}
                        >
                            Hoy
                        </button>
                        <button
                            className={`px-2 py-1 rounded-md ${range === "week" ? "bg-blue-600 text-white" : "hover:bg-gray-100"}`}
                            onClick={() => setRange("week")}
                        >
                            Esta semana
                        </button>
                        <button
                            className={`px-2 py-1 rounded-md ${range === "next30" ? "bg-blue-600 text-white" : "hover:bg-gray-100"}`}
                            onClick={() => setRange("next30")}
                        >
                            Próx. 30 días
                        </button>
                        <button
                            className={`px-2 py-1 rounded-md ${range === "all" ? "bg-blue-600 text-white" : "hover:bg-gray-100"}`}
                            onClick={() => setRange("all")}
                        >
                            Todas
                        </button>
                    </div>

                    <button
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-gray-50 text-sm"
                        onClick={() => setShowPast((v) => !v)}
                        title={showPast ? "Ocultar anteriores" : "Ver anteriores"}
                    >
                        {showPast ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        {showPast ? "Ocultar anteriores" : "Ver anteriores"}
                    </button>

                    <button
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-gray-50 text-sm"
                        onClick={load}
                        disabled={loading}
                        title="Actualizar"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                        Actualizar
                    </button>
                </div>
            </div>

            {errorMsg && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2 text-sm">{errorMsg}</div>
            )}

            <div className="rounded-2xl bg-white p-5 border border-blue-100 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                    <CalendarClock className="h-4 w-4" />
                    {visible.length} cita(s) mostradas
                    {!showPast && <span className="text-gray-400">(anteriores ocultas)</span>}
                </div>

                {/* listado por día */}
                <div className="mt-4 space-y-6">
                    {loading && <div className="text-sm text-gray-500">Cargando…</div>}
                    {!loading && grouped.length === 0 && (
                        <div className="text-sm text-gray-500">No hay citas para mostrar.</div>
                    )}
                    {!loading &&
                        grouped.map(([ymd, appts]) => (
                            <div key={ymd} className="rounded-xl border">
                                <div className="px-4 py-2 border-b bg-gray-50 text-sm font-semibold text-gray-700 flex items-center justify-between">
                                    <span>{ymd}</span>
                                    <span className="text-xs text-gray-500">{appts.length} cita(s)</span>
                                </div>
                                <div className="divide-y">
                                    {appts.map((a) => (
                                        <div key={a.id} className="px-4 py-3 flex items-center justify-between">
                                            <div className="flex items-center gap-6">
                                                <div className="font-mono tabular-nums text-blue-700">{a.time}</div>
                                                <div className="text-sm">
                                                    <div className="font-medium">
                                                        {a.patient_id ? `Paciente #${a.patient_id}` : <span className="text-gray-400">Sin asignar</span>}
                                                    </div>
                                                    <div className="mt-0.5">
                                                        <span className={`text-xs px-2 py-1 rounded-full ${statusBadge(a.status)}`}>{a.status}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    className="px-3 py-1.5 rounded-lg border text-gray-700 hover:bg-gray-50 text-sm inline-flex items-center gap-2"
                                                    onClick={() => openReschedule(a)}
                                                >
                                                    <CalendarDays className="h-4 w-4" /> Reagendar
                                                </button>
                                                <button
                                                    className={[
                                                        "px-3 py-1.5 rounded-lg text-sm inline-flex items-center gap-2",
                                                        a.canJoin
                                                            ? "bg-blue-700 text-white hover:bg-blue-800"
                                                            : "bg-gray-200 text-gray-500 cursor-not-allowed",
                                                    ].join(" ")}
                                                    disabled={!a.canJoin}
                                                    onClick={() => onJoin(a)}
                                                    title={a.canJoin ? "Unirse a la sesión" : "Disponible 5 min antes (si está confirmada)"}
                                                >
                                                    <Video className="h-4 w-4" /> Unirse
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                </div>
            </div>

            {/* Modal Reagendar */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/30" onClick={() => setModalOpen(false)} />
                    <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white shadow-xl border">
                        <div className="flex items-center justify-between p-4 border-b">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900">Reagendar cita</h3>
                                {currentAppt && (
                                    <p className="text-xs text-gray-500">
                                        Actual:{" "}
                                        <span className="font-mono text-blue-700">
                                            {toLocalYMD(currentAppt.start_at)} · {toLocalHM(currentAppt.start_at)}–{toLocalHM(currentAppt.end_at)}
                                        </span>
                                    </p>
                                )}
                            </div>
                            <button className="p-1.5 rounded-lg hover:bg-gray-100" onClick={() => setModalOpen(false)}>
                                <X className="h-5 w-5 text-gray-500" />
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            {currentAppt && (() => {
                                const now = nowInGYE()
                                const start = parseAsGYE(currentAppt.start_at)
                                const locked = (start.getTime() - now.getTime()) / 36e5 < 4

                                if (locked) {
                                    return (
                                        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-sm">
                                            No es posible reagendar: faltan menos de 4 horas para el inicio de esta cita.
                                        </div>
                                    )
                                }

                                return (
                                    <>
                                        <div className="grid sm:grid-cols-3 gap-3">
                                            <div className="sm:col-span-1">
                                                <label className="text-sm font-medium text-gray-700">Fecha (América/Guayaquil)</label>
                                                <input
                                                    type="date"
                                                    className="mt-1 w-full px-3 py-2 rounded-lg border"
                                                    value={pickDate}
                                                    onChange={onDateChange}
                                                />
                                            </div>
                                            <div className="sm:col-span-2">
                                                <label className="text-sm font-medium text-gray-700">Horarios disponibles</label>
                                                <div className="mt-1 min-h-[48px] rounded-xl border p-2">
                                                    {slotsLoading && <div className="text-sm text-gray-500">Cargando…</div>}
                                                    {!slotsLoading && slots.length === 0 && (
                                                        <div className="text-sm text-gray-500">No hay horarios para esta fecha.</div>
                                                    )}
                                                    {!slotsLoading && slots.length > 0 && (
                                                        <div className="flex flex-wrap gap-2">
                                                            {slots.map((s) => (
                                                                <button
                                                                    key={`${s.start_at}-${s.end_at}`}
                                                                    className="px-3 py-2 rounded-lg text-sm border text-emerald-800 border-emerald-200 hover:bg-emerald-50 font-mono tabular-nums"
                                                                    onClick={() => tryReschedule(s)}
                                                                    title="Elegir este horario"
                                                                >
                                                                    {toLocalHM(s.start_at)}–{toLocalHM(s.end_at)}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {modalMsg && (
                                            <div
                                                className={`rounded-lg px-3 py-2 text-sm ${modalMsg.startsWith("¡Listo!")
                                                    ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                                                    : "border border-amber-200 bg-amber-50 text-amber-800"
                                                    }`}
                                            >
                                                {modalMsg}
                                            </div>
                                        )}

                                        <div className="text-xs text-gray-500">
                                            Puedes reagendar hasta 4 horas antes del inicio.
                                        </div>
                                    </>
                                )
                            })()}
                        </div>

                        <div className="p-3 border-t flex items-center justify-end">
                            <button className="px-4 py-2 rounded-lg border hover:bg-gray-50" onClick={() => setModalOpen(false)}>
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
