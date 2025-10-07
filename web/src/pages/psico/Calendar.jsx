// src/pages/psico/Calendar.jsx
import React from "react"
import { apiGet, apiPost } from "../../lib/api"
import { getUserFromToken } from "../../lib/auth"

const TZ = "America/Guayaquil"

// ---------- helpers ----------
const ensureUTCString = (s) =>
    typeof s === "string" && (s.endsWith("Z") || s.includes("+")) ? s : `${s}Z`
const parseAsUTC = (s) => new Date(ensureUTCString(s))

const toLocalYMD = (iso) => {
    const d = new Date(iso)
    const y = d.toLocaleString("en-CA", { year: "numeric", timeZone: TZ })
    const m = d.toLocaleString("en-CA", { month: "2-digit", timeZone: TZ })
    const day = d.toLocaleString("en-CA", { day: "2-digit", timeZone: TZ })
    return `${y}-${m}-${day}`
}
const toLocalHM = (iso) =>
    new Date(iso).toLocaleTimeString("es-EC", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: TZ,
    })

const monthKeyOf = (iso) => {
    const d = new Date(iso)
    const y = d.toLocaleString("en-CA", { year: "numeric", timeZone: TZ })
    const m = d.toLocaleString("en-CA", { month: "2-digit", timeZone: TZ })
    return `${y}-${m}` // e.g. 2025-09
}
const monthLabel = (key) => {
    const [y, m] = key.split("-").map(Number)
    const d = new Date(Date.UTC(y, m - 1, 1))
    return d.toLocaleString("es-EC", { month: "long", year: "numeric", timeZone: TZ })
}

const statusBadge = (st) =>
    st === "confirmed"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-yellow-100 text-yellow-800"

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

                const now = new Date()
                const future = all.filter((a) => parseAsUTC(a.end_at) > now)
                future.sort((a, b) => parseAsUTC(a.start_at) - parseAsUTC(b.start_at))
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
            } catch { }
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
                } catch { }
            }
        }
        loadMissing()
    }, [appts, patientNames])

    // ✅ FIX: construir por mes usando la variable local 'byMonth'
    const groupedByMonth = React.useMemo(() => {
        const byMonth = {}
        for (const a of appts) {
            const mk = monthKeyOf(a.start_at)
            const ymd = toLocalYMD(a.start_at)
            byMonth[mk] ??= {}
            byMonth[mk][ymd] ??= []
            byMonth[mk][ymd].push(a)
        }
        // ordenar interno por hora asc
        for (const mk of Object.keys(byMonth)) {
            const days = byMonth[mk]
            for (const d of Object.keys(days)) {
                days[d].sort((x, y) => parseAsUTC(x.start_at) - parseAsUTC(y.start_at))
            }
        }
        return byMonth
    }, [appts])

    const monthKeys = React.useMemo(
        () => Object.keys(groupedByMonth).sort(),
        [groupedByMonth]
    )

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
                                                                    {toLocalHM(a.start_at)} — {name}
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
