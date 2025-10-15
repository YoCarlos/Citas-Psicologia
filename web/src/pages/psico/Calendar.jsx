// src/pages/psico/Calendar.jsx
import React from "react"
import { apiGet, apiPost } from "../../lib/api"
import { getUserFromToken } from "../../lib/auth"

// --- Day.js con TZ Ecuador ---
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import "dayjs/locale/es"

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.locale("es")

const TZ = "America/Guayaquil"
dayjs.tz.setDefault(TZ)

// ---------- helpers (todo en Ecuador) ----------
const dGYE = (iso) => (iso ? dayjs(iso).tz(TZ) : null)           // ISO UTC -> Ecuador
const fmtYMD = (iso) => dGYE(iso).format("YYYY-MM-DD")
const fmtHM = (iso) => dGYE(iso).format("HH:mm")

const monthKeyOf = (iso) => dGYE(iso).format("YYYY-MM")          // p.ej. 2025-09
const monthLabel = (key) => dayjs.tz(`${key}-01`, TZ).format("MMMM YYYY")

const statusBadge = (st) =>
    st === "confirmed" ? "bg-emerald-100 text-emerald-700" : "bg-yellow-100 text-yellow-800"

export default function Calendar() {
    const user = getUserFromToken()
    const doctorId = user?.role === "doctor" ? user?.id : user?.doctor_id

    const [appts, setAppts] = React.useState([])
    const [patientNames, setPatientNames] = React.useState({})
    const [loading, setLoading] = React.useState(false)
    const [errorMsg, setErrorMsg] = React.useState("")
    const [confirmingId, setConfirmingId] = React.useState(null)

    // Cargar futuras
    React.useEffect(() => {
        const load = async () => {
            if (!doctorId) return
            setLoading(true)
            setErrorMsg("")
            try {
                const qs = new URLSearchParams({
                    doctor_id: String(doctorId),
                    limit: "500",
                }).toString()
                const list = await apiGet(`/appointments?${qs}`)
                const all = Array.isArray(list) ? list : []

                const now = dayjs() // ahora (no hace falta TZ para comparar con ISO Z)
                const future = all.filter((a) => dayjs(a.end_at).isAfter(now))
                future.sort((a, b) => dayjs(a.start_at).valueOf() - dayjs(b.start_at).valueOf())
                setAppts(future)
            } catch (e) {
                setErrorMsg(e?.message || "No se pudo cargar el calendario.")
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [doctorId])

    // Cache nombres pacientes
    React.useEffect(() => {
        const loadPatients = async () => {
            if (!doctorId) return
            try {
                const qs = new URLSearchParams({
                    role: "patient",
                    doctor_id: String(doctorId),
                    limit: "500",
                }).toString()
                const list = await apiGet(`/users?${qs}`)
                const arr = Array.isArray(list) ? list : []
                const names = {}
                for (const u of arr) names[u.id] = u.name
                setPatientNames((prev) => ({ ...prev, ...names }))
            } catch {
                // silencio
            }
        }
        loadPatients()
    }, [doctorId])

    // Resolver nombres faltantes on-demand
    React.useEffect(() => {
        const missing = new Set()
        for (const a of appts) {
            if (a.patient_id && !patientNames[a.patient_id]) missing.add(a.patient_id)
        }
        if (missing.size === 0) return
        const loadMissing = async () => {
            for (const pid of missing) {
                try {
                    const u = await apiGet(`/users/${pid}`)
                    if (u?.id) setPatientNames((prev) => ({ ...prev, [u.id]: u.name }))
                } catch {
                    // silencio
                }
            }
        }
        loadMissing()
    }, [appts, patientNames])

    // Agrupar por mes/día en hora de Ecuador
    const groupedByMonth = React.useMemo(() => {
        const byMonth = {}
        for (const a of appts) {
            const mk = monthKeyOf(a.start_at)      // YYYY-MM en GYE
            const ymd = fmtYMD(a.start_at)         // YYYY-MM-DD en GYE
            byMonth[mk] ??= {}
            byMonth[mk][ymd] ??= []
            byMonth[mk][ymd].push(a)
        }
        // ordenar interno por hora asc
        for (const mk of Object.keys(byMonth)) {
            const days = byMonth[mk]
            for (const d of Object.keys(days)) {
                days[d].sort((x, y) => dayjs(x.start_at).valueOf() - dayjs(y.start_at).valueOf())
            }
        }
        return byMonth
    }, [appts])

    const monthKeys = React.useMemo(() => Object.keys(groupedByMonth).sort(), [groupedByMonth])

    const confirmOne = async (a) => {
        setConfirmingId(a.id)
        try {
            const upd = await apiPost(`/appointments/${a.id}/confirm`)
            setAppts((prev) => prev.map((x) => (x.id === a.id ? { ...x, ...upd } : x)))
        } catch (e) {
            setErrorMsg(e?.message || "No se pudo confirmar la cita.")
        } finally {
            setConfirmingId(null)
        }
    }

    return (
        <div className="rounded-2xl bg-white p-5 border border-emerald-100 shadow-sm">
            <div className="flex items-center justify-between">
                <h3 className="font-bold text-emerald-800">Calendario (solo futuras)</h3>
                <button
                    type="button"
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
                >
                    Crear cita
                </button>
            </div>

            {errorMsg && (
                <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2 text-sm">
                    {errorMsg}
                </div>
            )}

            {loading ? (
                <div className="mt-6 text-sm text-gray-500">Cargando calendario…</div>
            ) : (
                <div className="mt-6 space-y-8">
                    {monthKeys.length === 0 && (
                        <div className="text-sm text-gray-500">No hay citas futuras.</div>
                    )}

                    {monthKeys.map((mk) => {
                        const days = groupedByMonth[mk]
                        const dayKeys = Object.keys(days).sort()
                        return (
                            <div key={mk} className="space-y-4">
                                <div className="text-lg font-bold text-emerald-900">{monthLabel(mk)}</div>

                                <div className="grid md:grid-cols-2 gap-6">
                                    {dayKeys.map((d) => (
                                        <div key={d} className="rounded-xl border p-4">
                                            <div className="font-semibold text-emerald-700">{d}</div>
                                            <div className="mt-3 space-y-3">
                                                {days[d].map((a) => {
                                                    const name =
                                                        patientNames[a.patient_id] ||
                                                        (a.patient_id ? `Paciente #${a.patient_id}` : "Sin paciente")
                                                    const isPending = a.status === "pending"
                                                    const isConfirming = confirmingId === a.id
                                                    return (
                                                        <div
                                                            key={a.id}
                                                            className="flex items-center justify-between rounded-lg border p-3"
                                                        >
                                                            <div>
                                                                <div className="font-medium">
                                                                    {fmtHM(a.start_at)} — {name}
                                                                </div>
                                                                <div className="text-xs text-gray-500">
                                                                    #{a.id} • {a.method === "payphone" ? "Online" : "Sesión"}
                                                                    {a.zoom_join_url && (
                                                                        <>
                                                                            {" "}|{" "}
                                                                            <a
                                                                                href={a.zoom_join_url}
                                                                                target="_blank"
                                                                                rel="noreferrer"
                                                                                className="text-blue-700 hover:underline"
                                                                            >
                                                                                Zoom
                                                                            </a>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-2">
                                                                <span
                                                                    className={`text-xs px-2 py-1 rounded-full ${statusBadge(a.status)}`}
                                                                    title={`Estado: ${a.status}`}
                                                                >
                                                                    {a.status}
                                                                </span>

                                                                {isPending && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => confirmOne(a)}
                                                                        disabled={isConfirming}
                                                                        className="px-3 py-1 rounded-lg bg-blue-700 text-white text-sm hover:bg-blue-800 disabled:opacity-60"
                                                                    >
                                                                        {isConfirming ? "Confirmando..." : "Confirmar"}
                                                                    </button>
                                                                )}

                                                                {!isPending && (
                                                                    <button
                                                                        type="button"
                                                                        className="px-3 py-1 rounded-lg border text-gray-700 hover:bg-gray-50 text-sm"
                                                                    >
                                                                        Ver
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
