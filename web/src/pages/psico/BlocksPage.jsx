import React from "react"
import { apiGet, apiPost } from "../../lib/api"
import { getUserFromToken } from "../../lib/auth"
import { Info, Plus, Trash2, CalendarClock } from "lucide-react"

const TZ = "America/Guayaquil"
const pad = (n) => String(n).padStart(2, "0")

const todayYMD = () => {
    const now = new Date()
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const toISOAtTZ = (ymd, hm = "00:00") => {
    // ymd: YYYY-MM-DD, hm: HH:MM
    return new Date(`${ymd}T${hm}:00-05:00`).toISOString()
}

const Banner = ({ kind = "info", children }) => {
    const classes = {
        info: "border-blue-200 bg-blue-50 text-blue-800",
        success: "border-emerald-200 bg-emerald-50 text-emerald-800",
        error: "border-rose-200 bg-rose-50 text-rose-700",
    }[kind]
    return (
        <div className={`rounded-lg border px-3 py-2 text-sm ${classes} flex items-start gap-2`}>
            <Info className="h-4 w-4 mt-0.5" />
            <div>{children}</div>
        </div>
    )
}

export default function BlocksPage() {
    const user = getUserFromToken()
    const doctorId = user?.id

    const [msg, setMsg] = React.useState({ type: "", text: "" })
    const [loading, setLoading] = React.useState(false)
    const [items, setItems] = React.useState([])

    // form
    const [day, setDay] = React.useState(todayYMD())
    const [allDay, setAllDay] = React.useState(true)
    const [startHM, setStartHM] = React.useState("00:00")
    const [endHM, setEndHM] = React.useState("23:59")
    const [reason, setReason] = React.useState("Vacaciones")

    const load = React.useCallback(async () => {
        if (!doctorId) return
        setLoading(true)
        setMsg({ type: "", text: "" })
        try {
            const qs = new URLSearchParams({
                doctor_id: String(doctorId),
                // opcional: podrías pasar un rango de fechas
                skip: "0",
                limit: "500",
            }).toString()
            const res = await apiGet(`/blocks?${qs}`)
            setItems(Array.isArray(res) ? res : [])
        } catch (e) {
            setMsg({ type: "error", text: e?.message || "No se pudieron cargar los bloqueos." })
        } finally {
            setLoading(false)
        }
    }, [doctorId])

    React.useEffect(() => { load() }, [load])

    const create = async () => {
        if (!doctorId) return
        setMsg({ type: "", text: "" })
        try {
            const start_at = allDay ? toISOAtTZ(day, "00:00") : toISOAtTZ(day, startHM)
            const end_at = allDay ? toISOAtTZ(day, "23:59") : toISOAtTZ(day, endHM)
            const payload = {
                doctor_id: doctorId,
                start_at,
                end_at,
                all_day: allDay,
                reason: reason?.trim() || null,
            }
            await apiPost("/blocks", payload)
            setMsg({ type: "success", text: "Bloqueo creado." })
            await load()
        } catch (e) {
            setMsg({ type: "error", text: e?.detail || e?.message || "No se pudo crear el bloqueo." })
        }
    }

    const remove = async (id) => {
        try {
            await apiDelete(`/blocks/${id}`)
            await load()
        } catch (e) {
            setMsg({ type: "error", text: e?.message || "No se pudo eliminar el bloqueo." })
        }
    }

    const fmt = (iso) =>
        new Date(iso).toLocaleString("es-EC", {
            timeZone: TZ,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        })

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-emerald-800">Bloqueos de agenda</h1>
                <div className="text-sm text-gray-500 flex items-center gap-2">
                    <CalendarClock className="h-4 w-4" /> TZ: América/Guayaquil
                </div>
            </div>

            {msg.text && (
                <Banner kind={msg.type === "success" ? "success" : msg.type === "error" ? "error" : "info"}>
                    {msg.text}
                </Banner>
            )}

            {/* Formulario */}
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Día</label>
                        <input type="date" className="w-full px-3 py-2 rounded-lg border text-sm" value={day} onChange={(e) => setDay(e.target.value)} />
                    </div>

                    <div className="flex items-center gap-2 mt-6 md:mt-0">
                        <input id="allday" type="checkbox" className="h-4 w-4" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
                        <label htmlFor="allday" className="text-sm text-gray-700">Bloquear todo el día</label>
                    </div>

                    {!allDay && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
                                <input type="time" className="w-full px-3 py-2 rounded-lg border text-sm" value={startHM} onChange={(e) => setStartHM(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
                                <input type="time" className="w-full px-3 py-2 rounded-lg border text-sm" value={endHM} onChange={(e) => setEndHM(e.target.value)} />
                            </div>
                        </>
                    )}
                </div>

                <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Motivo (opcional)</label>
                    <input type="text" className="w-full px-3 py-2 rounded-lg border text-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Vacaciones" />
                </div>

                <div className="mt-4">
                    <button onClick={create} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700">
                        <Plus className="h-4 w-4" /> Crear bloqueo
                    </button>
                </div>
            </div>

            {/* Listado */}
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-emerald-800">Bloqueos existentes</h3>
                {loading ? (
                    <div className="mt-3 text-sm text-gray-500">Cargando…</div>
                ) : (
                    <div className="mt-3 divide-y">
                        {items.length === 0 && <div className="text-sm text-gray-500">No hay bloqueos.</div>}
                        {items.map(b => (
                            <div key={b.id} className="py-3 flex items-center justify-between">
                                <div>
                                    <div className="font-medium">
                                        {fmt(b.start_at)} — {fmt(b.end_at)}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {b.all_day ? "Todo el día" : "Franja horaria"}{b.reason ? ` • ${b.reason}` : ""}
                                    </div>
                                </div>
                                <button
                                    onClick={() => remove(b.id)}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-gray-700 hover:bg-gray-50 text-sm"
                                >
                                    <Trash2 className="h-4 w-4" /> Eliminar
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
