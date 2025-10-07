// src/pages/psico/Dashboard.jsx
import React from "react"
import { Link } from "react-router-dom"
import { apiGet } from "../../lib/api"
import { getUserFromToken } from "../../lib/auth"

const TZ = "America/Guayaquil"

// ---------- helpers de fecha/hora ----------
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

const todayYMD = () => toLocalYMD(new Date().toISOString())

// si llega sin timezone (ej. "2025-09-25T10:00:00") lo tratamos como UTC
const ensureUTCString = (s) => (typeof s === "string" && (s.endsWith("Z") || s.includes("+"))) ? s : `${s}Z`
const parseAsUTC = (s) => new Date(ensureUTCString(s))

// agrupa por día local
const groupByDay = (items) => {
    const map = {}
    for (const a of items) {
        const ymd = toLocalYMD(a.start_at)
        if (!map[ymd]) map[ymd] = []
        map[ymd].push(a)
    }
    for (const k of Object.keys(map)) {
        map[k].sort((a, b) => parseAsUTC(a.start_at) - parseAsUTC(b.start_at))
    }
    return map
}

export default function Dashboard() {
    const user = getUserFromToken()
    const doctorId = user?.role === "doctor" ? user?.id : user?.doctor_id

    const [appts, setAppts] = React.useState([])
    const [patientNames, setPatientNames] = React.useState({})
    const [pacientesActivos, setPacientesActivos] = React.useState(0)

    // KPIs
    const totalCitas = appts.length
    const hoy = todayYMD()
    const citasHoy = appts.filter((a) => toLocalYMD(a.start_at) === hoy).length

    // Próximas (futuras) y top 5 agrupadas
    const now = new Date()
    const futuras = React.useMemo(
        () =>
            appts
                .filter((a) => parseAsUTC(a.start_at) >= now)
                .sort((a, b) => parseAsUTC(a.start_at) - parseAsUTC(b.start_at)),
        [appts]
    )
    const futurasTop5 = futuras.slice(0, 5)
    const futurasGrouped = groupByDay(futurasTop5)

    // Agenda de hoy
    const agendaHoy = React.useMemo(
        () =>
            appts
                .filter((a) => toLocalYMD(a.start_at) === hoy)
                .sort((a, b) => parseAsUTC(a.start_at) - parseAsUTC(b.start_at)),
        [appts, hoy]
    )

    // Cargar citas
    React.useEffect(() => {
        const loadAppts = async () => {
            if (!doctorId) return
            const qs = new URLSearchParams({ doctor_id: String(doctorId), limit: "500" }).toString()
            const list = await apiGet(`/appointments?${qs}`)
            setAppts(Array.isArray(list) ? list : [])
        }
        loadAppts()
    }, [doctorId])

    // Cargar pacientes activos (todos los pacientes de la doctora) + cache de nombres
    React.useEffect(() => {
        const loadPatients = async () => {
            if (!doctorId) return
            const qs = new URLSearchParams({ role: "patient", doctor_id: String(doctorId), limit: "500" }).toString()
            const list = await apiGet(`/users?${qs}`)
            const arr = Array.isArray(list) ? list : []
            setPacientesActivos(arr.length)
            const names = {}
            for (const u of arr) names[u.id] = u.name
            setPatientNames((prev) => ({ ...prev, ...names }))
        }
        loadPatients()
    }, [doctorId])

    // Completar nombres faltantes si aparece un patient_id que no está en el cache
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

    const kpis = [
        { label: "Citas hoy", value: citasHoy },
        { label: "Total de citas", value: totalCitas },
        { label: "Pacientes activos", value: pacientesActivos },
    ]

    return (
        <div className="space-y-6">
            <div className="grid sm:grid-cols-3 gap-4">
                {kpis.map((k, i) => (
                    <div key={i} className="rounded-2xl bg-white p-5 border border-emerald-100 shadow-sm">
                        <div className="text-sm text-gray-500">{k.label}</div>
                        <div className="mt-1 text-3xl font-extrabold text-emerald-700">{k.value}</div>
                    </div>
                ))}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                {/* Próximas citas (agrupadas por día, con tarjeta/borde por cita) */}
                <div className="rounded-2xl bg-white p-5 border border-blue-100 shadow-sm">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-blue-800">Próximas citas</h3>
                        <Link to="/psico/citas" className="text-sm text-blue-700 hover:underline">
                            Ver todas
                        </Link>
                    </div>

                    <div className="mt-4 space-y-5">
                        {Object.keys(futurasGrouped).length === 0 && (
                            <div className="text-sm text-gray-500">No hay próximas citas.</div>
                        )}

                        {Object.keys(futurasGrouped)
                            .sort()
                            .map((ymd) => (
                                <div key={ymd} className="space-y-3">
                                    <div className="text-xs font-semibold text-gray-600">{ymd}</div>
                                    {futurasGrouped[ymd].map((a) => {
                                        const name = patientNames[a.patient_id] || `Paciente #${a.patient_id}`
                                        return (
                                            <div key={a.id} className="flex items-center justify-between rounded-xl border p-3">
                                                <div>
                                                    <div className="font-semibold">{name}</div>
                                                    <div className="text-sm text-gray-500">
                                                        {toLocalYMD(a.start_at)} · {toLocalHM(a.start_at)} ·{" "}
                                                        {a.method === "payphone" ? "Online" : "Sesión"}
                                                    </div>
                                                </div>
                                                <span
                                                    className={`text-xs px-2 py-1 rounded-full ${a.status === "confirmed"
                                                        ? "bg-emerald-100 text-emerald-700"
                                                        : "bg-yellow-100 text-yellow-800"
                                                        }`}
                                                >
                                                    {a.status}
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            ))}
                    </div>
                </div>

                {/* Agenda de hoy (botón Iniciar habilitable 5 min antes) */}
                <div className="rounded-2xl bg-white p-5 border border-emerald-100 shadow-sm">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-emerald-800">Agenda de hoy</h3>
                        <Link to="/psico/calendario" className="text-sm text-emerald-700 hover:underline">
                            Calendario
                        </Link>
                    </div>

                    <div className="mt-4 space-y-3">
                        {agendaHoy.length === 0 && <div className="text-sm text-gray-500">No hay citas hoy.</div>}
                        {agendaHoy.map((a) => {
                            const name = patientNames[a.patient_id] || `Paciente #${a.patient_id}`
                            const start = parseAsUTC(a.start_at)
                            const canStart = Date.now() >= (start.getTime() - 5 * 60 * 1000)

                            return (
                                <div key={a.id} className="flex items-center justify-between rounded-xl border p-3">
                                    <div>
                                        <div className="font-semibold">
                                            {toLocalHM(a.start_at)} — {name}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {a.method === "payphone" ? "Online" : "Sesión"} • #{a.id}
                                        </div>
                                    </div>
                                    <button
                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                                        disabled={!canStart}
                                        title={!canStart ? "Disponible 5 minutos antes del inicio" : "Iniciar sesión"}
                                    >
                                        Iniciar
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}
