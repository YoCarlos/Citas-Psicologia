// src/pages/psico/CreateAppointmentSchedule.jsx
import React from "react"
import MonthCalendar from "../../components/MonthCalendar"
import { apiGet, apiPost } from "../../lib/api"
import { getUserFromToken } from "../../lib/auth"
import { Clock4, ArrowRight, Users, Info, CheckCircle2, Trash2 } from "lucide-react"
import { useNavigate } from "react-router-dom"

// --- utilidades ---
const pad = (n) => String(n).padStart(2, "0")
const TZ = "America/Guayaquil"

// ------------------------------
// Helpers robustos de fecha/hora
// ------------------------------
const hasTZ = (s) => /Z$|[+\-]\d{2}:\d{2}$/.test(String(s || ""))

/**
 * Interpreta cualquier ISO así:
 * - Si trae Z/offset => respeta el offset
 * - Si NO trae zona  => trátalo como UTC agregando 'Z'
 */
const parseAny = (iso) => new Date(hasTZ(iso) ? iso : `${iso}Z`)

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

// Hoy YYYY-MM-DD en GYE
const todayYMD = () => {
    const now = nowInGYE()
    const y = now.toLocaleString("en-CA", { year: "numeric", timeZone: TZ })
    const m = now.toLocaleString("en-CA", { month: "2-digit", timeZone: TZ })
    const d = now.toLocaleString("en-CA", { day: "2-digit", timeZone: TZ })
    return `${y}-${m}-${d}`
}

const addDays = (date, days) => {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    return d
}

// Render siempre en GYE
const toLocalHM = (isoString) =>
    parseAny(isoString).toLocaleTimeString("es-EC", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: TZ,
    })

const getLocalHour = (isoString) =>
    Number(parseAny(isoString).toLocaleString("en-CA", { hour: "2-digit", hour12: false, timeZone: TZ }))

const toLocalYMD = (isoString) => {
    const d = parseAny(isoString)
    const y = d.toLocaleString("en-CA", { year: "numeric", timeZone: TZ })
    const m = d.toLocaleString("en-CA", { month: "2-digit", timeZone: TZ })
    const day = d.toLocaleString("en-CA", { day: "2-digit", timeZone: TZ })
    return `${y}-${m}-${day}`
}

// Inicio / fin del día **en GYE** (pared horaria -05:00) -> luego .toISOString() (UTC)
const startOfDayGYE = (ymd) => new Date(`${ymd}T00:00:00-05:00`)
const endOfDayGYE = (ymd) => new Date(`${ymd}T23:59:59-05:00`)

// Agrupa slots [{start_at,end_at}] por "YYYY-MM-DD" en TZ local y arma label "HH:MM–HH:MM"
function groupSlotsByDay(slots) {
    const map = {}
    for (const s of slots) {
        const ymd = toLocalYMD(s.start_at)
        const startLabel = toLocalHM(s.start_at)
        const endLabel = toLocalHM(s.end_at)
        const label = `${startLabel}–${endLabel}`
        const hour = getLocalHour(s.start_at)
        const isPM = hour >= 12
        if (!map[ymd]) map[ymd] = []
        map[ymd].push({ startISO: s.start_at, endISO: s.end_at, label, isPM })
    }
    for (const k of Object.keys(map)) {
        // ordenar por instante real (UTC) con parseAny
        map[k].sort((a, b) => parseAny(a.startISO) - parseAny(b.startISO))
    }
    return map
}

// Divide [from, to) en ventanas de hasta maxDays días
function chunkRanges(from, to, maxDays = 31) {
    const chunks = []
    let curStart = new Date(from)
    while (curStart < to) {
        const curEnd = addDays(curStart, maxDays)
        chunks.push({ from: curStart, to: curEnd < to ? curEnd : to })
        curStart = curEnd
    }
    return chunks
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

export default function CreateAppointmentSchedule() {
    const nav = useNavigate()
    const user = getUserFromToken()
    const role = user?.role
    const doctorId = role === "doctor" ? user?.id : user?.doctor_id

    const initial = todayYMD()
    const [selected, setSelected] = React.useState(initial)

    const [loading, setLoading] = React.useState(false)
    const [errorMsg, setErrorMsg] = React.useState("")
    const [availMap, setAvailMap] = React.useState({})

    // pacientes
    const [patients, setPatients] = React.useState([])
    const [patientId, setPatientId] = React.useState("")

    // resultados de creación
    const [creating, setCreating] = React.useState(false)
    const [msg, setMsg] = React.useState({ type: "", text: "" })
    const [results, setResults] = React.useState([]) // [{key,status,appt|error}]

    // selección de slots (clave = `${startISO}|${endISO}`)
    const [picked, setPicked] = React.useState(() => new Set())

    // badges = número de slots por fecha
    const badges = React.useMemo(() => {
        const b = {}
        for (const k of Object.keys(availMap)) b[k] = availMap[k]?.length || 0
        return b
    }, [availMap])

    const selectedSlots = availMap[selected] ?? []

    // descarta slots que ya empezaron si el día seleccionado es hoy (comparando en GYE)
    const filteredSelectedSlots = React.useMemo(() => {
        const today = todayYMD()
        if (selected !== today) return selectedSlots
        const now = nowInGYE()
        return selectedSlots.filter((s) => parseAny(s.startISO) > now)
    }, [selected, selectedSlots])

    // separa en mañana/tarde
    const amSlots = React.useMemo(
        () => filteredSelectedSlots.filter((s) => !s.isPM),
        [filteredSelectedSlots]
    )
    const pmSlots = React.useMemo(
        () => filteredSelectedSlots.filter((s) => s.isPM),
        [filteredSelectedSlots]
    )

    // Carga inicial: pacientes + 60 días de disponibilidad desde hoy (GYE)
    React.useEffect(() => {
        if (!doctorId) {
            setErrorMsg("No encontramos la doctora asignada.")
            return
        }
        const load = async () => {
            setLoading(true)
            setErrorMsg("")
            try {
                // 1) Pacientes de la doctora
                try {
                    const qs = new URLSearchParams({
                        doctor_id: String(doctorId),
                        skip: "0",
                        limit: "200",
                    }).toString()
                    const pats = await apiGet(`/users?${qs}`)
                    setPatients(Array.isArray(pats) ? pats : [])
                } catch {
                    setPatients([])
                }

                // 2) Slots (60 días, chunk 31) — construyendo rangos desde GYE
                const fromGYE = nowInGYE()
                const toGYE = addDays(fromGYE, 60)
                const ranges = chunkRanges(fromGYE, toGYE, 31)

                const allSlots = []
                for (const win of ranges) {
                    // IMPORTANTE: mandamos ISO UTC al backend, pero el rango nació desde GYE
                    const qs = new URLSearchParams({
                        doctor_id: String(doctorId),
                        date_from: win.from.toISOString(),
                        date_to: win.to.toISOString(),
                    }).toString()
                    const part = await apiGet(`/availability/slots?${qs}`)
                    if (Array.isArray(part)) allSlots.push(...part)
                }
                setAvailMap(groupSlotsByDay(allSlots))
            } catch (err) {
                setErrorMsg(err?.message || "No se pudo cargar disponibilidad.")
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [doctorId])

    // toggle de selección
    const keyOf = (s) => `${s.startISO}|${s.endISO}`
    const isPicked = (s) => picked.has(keyOf(s))
    const togglePick = (s) => {
        setPicked((prev) => {
            const next = new Set(prev)
            const k = keyOf(s)
            if (next.has(k)) next.delete(k)
            else next.add(k)
            return next
        })
    }

    // lista de seleccionados (ordenados por fecha/hora) y agrupados por día
    const pickedList = React.useMemo(() => {
        const out = []
        for (const ymd of Object.keys(availMap)) {
            const daySlots = (availMap[ymd] || []).filter((s) => picked.has(keyOf(s)))
            if (daySlots.length) {
                const sorted = [...daySlots].sort((a, b) => parseAny(a.startISO) - parseAny(b.startISO))
                out.push({ ymd, slots: sorted })
            }
        }
        if (!out.find((g) => g.ymd === selected)) {
            const daySlots = (selectedSlots || []).filter((s) => picked.has(keyOf(s)))
            if (daySlots.length) {
                const sorted = [...daySlots].sort((a, b) => parseAny(a.startISO) - parseAny(b.startISO))
                out.push({ ymd: selected, slots: sorted })
            }
        }
        // ordenar días por fecha (YYYY-MM-DD)
        out.sort((a, b) => parseAny(`${a.ymd}T00:00:00Z`) - parseAny(`${b.ymd}T00:00:00Z`))
        return out
    }, [picked, availMap, selected, selectedSlots])

    const pickedCount = React.useMemo(() => Array.from(picked).length, [picked])

    // Crear todas las citas seleccionadas (batch)
    const createAll = async () => {
        if (!patientId) { setMsg({ type: "error", text: "Selecciona un paciente." }); return }
        if (pickedCount === 0) { setMsg({ type: "error", text: "Selecciona al menos un horario." }); return }

        setCreating(true)
        setMsg({ type: "", text: "" })
        setResults([])

        // Expandir lista de items desde pickedList
        const items = pickedList.flatMap(group =>
            group.slots.map(s => ({ start_at: s.startISO, end_at: s.endISO }))
        )

        const promises = items.map(({ start_at, end_at }) =>
            apiPost("/appointments", {
                doctor_id: doctorId,
                patient_id: Number(patientId),
                // IMPORTANTE: enviamos ISO tal cual del slot (debería venir UTC/Z del backend)
                // Si algún backend devuelve naive, igual quedará consistente con parseAny en UI.
                start_at,
                end_at,
                method: "payphone",
            })
                .then(appt => ({ key: `${start_at}|${end_at}`, status: "fulfilled", appt }))
                .catch(err => ({ key: `${start_at}|${end_at}`, status: "rejected", error: err?.detail || err?.message || "Error" }))
        )

        const settled = await Promise.all(promises)
        setResults(settled)

        const ok = settled.filter(r => r.status === "fulfilled").length
        const ko = settled.length - ok

        if (ok > 0 && ko === 0) {
            setMsg({ type: "success", text: `¡Listo! Se crearon ${ok} cita(s) confirmada(s).` })
            setPicked(new Set())
            nav(`/psico/calendario`)
        } else if (ok > 0 && ko > 0) {
            setMsg({ type: "info", text: `Se crearon ${ok} cita(s). ${ko} fallaron (ver detalle abajo).` })
        } else {
            setMsg({ type: "error", text: `No se pudo crear ninguna cita. Revisa los mensajes abajo.` })
        }

        setCreating(false)
    }

    const clearPicked = () => {
        setPicked(new Set())
        setResults([])
        setMsg({ type: "", text: "" })
    }

    const Section = ({ title, count, children }) => (
        <div className="mt-4">
            <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
                <span className="text-xs rounded-full bg-gray-100 text-gray-700 px-2 py-0.5">{count}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {children}
            </div>
        </div>
    )

    const SlotButton = ({ s }) => {
        const active = isPicked(s)
        return (
            <button
                key={`${s.startISO}-${s.endISO}`}
                onClick={() => togglePick(s)}
                title={`Seleccionar ${s.label}`}
                className={[
                    "px-3 py-2 rounded-lg text-sm flex items-center gap-2 whitespace-nowrap font-mono tabular-nums border",
                    active
                        ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                        : "border-emerald-200 text-emerald-800 hover:bg-emerald-50",
                ].join(" ")}
            >
                <Clock4 className="h-4 w-4" />
                {s.label}
            </button>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-emerald-800">Crear citas (Psicóloga)</h1>
                <p className="text-gray-600">Selecciona paciente y uno o varios horarios; abajo verás tu selección y podrás crear las citas.</p>
            </div>

            {msg.text && (
                <Banner kind={msg.type === "success" ? "success" : msg.type === "error" ? "error" : "info"}>
                    {msg.text}
                </Banner>
            )}

            {/* Selector de paciente */}
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-2">Paciente</label>
                <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-emerald-700" />
                    <select
                        className="px-3 py-2 rounded-lg border text-sm"
                        value={patientId}
                        onChange={(e) => setPatientId(e.target.value)}
                    >
                        <option value="">— Selecciona —</option>
                        {patients.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name || p.email}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="text-xs text-gray-500 mt-1">Pacientes cargados: {patients.length}</div>
            </div>

            {/* Calendario */}
            <MonthCalendar
                value={selected}
                onChange={setSelected}
                badges={badges}
                locale="es-EC"
                minDate={todayYMD()} // deshabilita pasados (en GYE)
            />

            {/* Horarios del día */}
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-emerald-800">Horarios disponibles — {selected}</h3>
                    <div className="text-xs text-gray-500">TZ: América/Guayaquil</div>
                </div>

                {errorMsg && (
                    <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2 text-sm">
                        {errorMsg}
                    </div>
                )}

                {loading ? (
                    <div className="mt-4 text-sm text-gray-500">Cargando horarios…</div>
                ) : (
                    <>
                        {filteredSelectedSlots.length === 0 ? (
                            <div className="mt-4 text-sm text-gray-500">No hay horarios disponibles para esta fecha.</div>
                        ) : (
                            <>
                                <Section title="Mañana" count={amSlots.length}>
                                    {amSlots.length === 0 ? (
                                        <div className="col-span-full text-sm text-gray-400">Sin horarios por la mañana.</div>
                                    ) : (
                                        amSlots.map((s) => <SlotButton key={`${s.startISO}-${s.endISO}`} s={s} />)
                                    )}
                                </Section>

                                <Section title="Tarde" count={pmSlots.length}>
                                    {pmSlots.length === 0 ? (
                                        <div className="col-span-full text-sm text-gray-400">Sin horarios por la tarde.</div>
                                    ) : (
                                        pmSlots.map((s) => <SlotButton key={`${s.startISO}-${s.endISO}`} s={s} />)
                                    )}
                                </Section>
                            </>
                        )}
                    </>
                )}
            </div>

            {/* Resumen de selección */}
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-emerald-800">Tu selección</h3>
                {pickedList.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">Aún no has seleccionado horarios.</p>
                ) : (
                    <div className="mt-3 space-y-4">
                        {pickedList.map((g) => (
                            <div key={g.ymd}>
                                <div className="text-sm font-medium text-gray-700">{g.ymd}</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {g.slots.map((s) => (
                                        <span
                                            key={`${s.startISO}-${s.endISO}`}
                                            className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-mono tabular-nums whitespace-nowrap"
                                        >
                                            {toLocalHM(s.startISO)}–{toLocalHM(s.endISO)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="text-sm text-gray-700">
                        Citas a crear: <span className="font-semibold">{Array.from(picked).length}</span>
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={clearPicked}
                            disabled={pickedCount === 0}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                        >
                            <Trash2 className="h-4 w-4" /> Limpiar
                        </button>

                        <button
                            type="button"
                            onClick={createAll}
                            disabled={pickedCount === 0 || !patientId || creating}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-60"
                            title={!patientId ? "Selecciona un paciente primero" : "Crear citas"}
                        >
                            Crear citas
                            <ArrowRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Detalle de resultados (éxitos/errores) */}
                {results.length > 0 && (
                    <div className="mt-4 space-y-2">
                        {results.map((r) => {
                            const [start, end] = r.key.split("|")
                            const label = `${toLocalHM(start)}–${toLocalHM(end)}`
                            return (
                                <div
                                    key={r.key}
                                    className={`text-sm rounded-lg border px-3 py-2 flex items-center gap-2 ${r.status === "fulfilled"
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                        : "border-rose-200 bg-rose-50 text-rose-700"
                                        }`}
                                >
                                    {r.status === "fulfilled" ? <CheckCircle2 className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                                    <div className="font-mono tabular-nums">{label}</div>
                                    <div className="ml-auto">
                                        {r.status === "fulfilled" ? `OK (id ${r.appt?.id ?? "?"})` : r.error}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
