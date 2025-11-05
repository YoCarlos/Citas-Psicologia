// src/pages/paciente/PatientSchedule.jsx
import React from "react"
import MonthCalendar, { toYMD } from "../../components/MonthCalendar"
import { apiGet } from "../../lib/api"
import { getUserFromToken } from "../../lib/auth"
import { Clock4, ArrowRight, Info } from "lucide-react"
import { useNavigate, useSearchParams } from "react-router-dom"

// --- utilidades ---
const pad = (n) => String(n).padStart(2, "0")
const TZ = "America/Guayaquil"
const DEFAULT_LEAD_MINUTES = 60 // margen mínimo para agendar (minutos)

const todayYMD = () => {
    const now = new Date()
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const addDays = (date, days) => {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    return d
}

// ===== Normalización de zonas =====
// ¿El string trae zona (Z o ±HH:MM)?
const hasTZ = (s) => /Z$|[+\-]\d{2}:\d{2}$/.test(s || "")

/** 
 * Interpreta ISO como:
 * - si trae Z/offset => respeta offset
 * - si NO trae zona => forzamos -05:00 (GYE, sin DST)
 */
const parseAsGYE = (iso) => {
    if (!iso) return null
    const normalized = hasTZ(iso) ? iso : `${iso}-05:00`
    return new Date(normalized)
}

// Epoch ms seguro (independiente de zona)
const toMs = (iso) => parseAsGYE(iso)?.getTime() ?? NaN

// Ahora (pared horaria de GYE) para mostrar/debug
const nowInGYE = () => {
    const y = Number(new Date().toLocaleString("en-CA", { year: "numeric", timeZone: TZ }))
    const m = Number(new Date().toLocaleString("en-CA", { month: "2-digit", timeZone: TZ }))
    const d = Number(new Date().toLocaleString("en-CA", { day: "2-digit", timeZone: TZ }))
    const hh = Number(new Date().toLocaleString("en-CA", { hour: "2-digit", hour12: false, timeZone: TZ }))
    const mm = Number(new Date().toLocaleString("en-CA", { minute: "2-digit", timeZone: TZ }))
    const ss = Number(new Date().toLocaleString("en-CA", { second: "2-digit", timeZone: TZ }))
    return new Date(`${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:${pad(ss)}-05:00`)
}

// Render helpers (siempre en GYE)
const toLocalHM = (isoString) =>
    parseAsGYE(isoString).toLocaleTimeString("es-EC", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: TZ,
    })

const getLocalHour = (isoString) =>
    Number(parseAsGYE(isoString).toLocaleString("en-CA", { hour: "2-digit", hour12: false, timeZone: TZ }))

const toLocalYMD = (isoString) => {
    const d = parseAsGYE(isoString)
    const y = d.toLocaleString("en-CA", { year: "numeric", timeZone: TZ })
    const m = d.toLocaleString("en-CA", { month: "2-digit", timeZone: TZ })
    const day = d.toLocaleString("en-CA", { day: "2-digit", timeZone: TZ })
    return `${y}-${m}-${day}`
}

// Agrupa slots [{start_at,end_at}] por "YYYY-MM-DD" (GYE) y arma label "HH:MM–HH:MM"
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
        map[k].sort((a, b) => toMs(a.startISO) - toMs(b.startISO))
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

// Solape de intervalos [start,end) usando epoch ms
function overlaps(aStartISO, aEndISO, bStartISO, bEndISO) {
    const a1 = toMs(aStartISO)
    const a2 = toMs(aEndISO)
    const b1 = toMs(bStartISO)
    const b2 = toMs(bEndISO)
    return a1 < b2 && b1 < a2
}

export default function PatientSchedule() {
    const nav = useNavigate()
    const [sp] = useSearchParams()
    const DEBUG = sp.get("debug") === "1"

    const user = getUserFromToken()
    const role = user?.role

    // doctor_id: prioridad querystring > doctor (si es doctora logueada) > doctor asignado al paciente
    const qsDoctorId = sp.get("doctor_id")
    const doctorId = qsDoctorId ? Number(qsDoctorId) : role === "doctor" ? user?.id : user?.doctor_id

    const initial = todayYMD()
    const [selected, setSelected] = React.useState(initial)

    const [loading, setLoading] = React.useState(false)
    const [errorMsg, setErrorMsg] = React.useState("")
    const [availMap, setAvailMap] = React.useState({})
    const [priceUSD, setPriceUSD] = React.useState(35) // fallback si no hay settings
    const [leadMinutes, setLeadMinutes] = React.useState(DEFAULT_LEAD_MINUTES) // margen de antelación

    // selección de slots (clave = `${startISO}|${endISO}`)
    const [picked, setPicked] = React.useState(() => new Set())

    // 🔒 Filtrar disponibilidad global por margen mínimo (leadMinutes)
    const availMapFiltered = React.useMemo(() => {
        const leadMs = leadMinutes * 60 * 1000
        const nowMs = Date.now() // epoch actual del cliente
        const minStartMs = nowMs + leadMs

        const out = {}
        for (const ymd of Object.keys(availMap)) {
            out[ymd] = (availMap[ymd] || []).filter((s) => toMs(s.startISO) >= minStartMs)
        }
        return out
    }, [availMap, leadMinutes])

    // badges = número de slots por fecha (ya filtrados por margen)
    const badges = React.useMemo(() => {
        const b = {}
        for (const k of Object.keys(availMapFiltered)) b[k] = availMapFiltered[k]?.length || 0
        return b
    }, [availMapFiltered])

    const selectedSlots = availMapFiltered[selected] ?? []

    // separa en mañana/tarde (ya con margen aplicado)
    const amSlots = React.useMemo(() => selectedSlots.filter((s) => !s.isPM), [selectedSlots])
    const pmSlots = React.useMemo(() => selectedSlots.filter((s) => s.isPM), [selectedSlots])

    // Carga inicial: settings (precio) + 60 días de disponibilidad desde hoy, y filtrado por citas ocupadas
    React.useEffect(() => {
        if (!doctorId) {
            setErrorMsg("No encontramos la doctora asignada. Solicita una.")
            return
        }
        let isMounted = true

        const load = async () => {
            setLoading(true)
            setErrorMsg("")
            try {
                // 1) Precio (settings/consultation)
                try {
                    const cfg = await apiGet(`/settings/consultation?doctor_id=${doctorId}`)
                    if (isMounted && cfg?.price_usd != null) setPriceUSD(Number(cfg.price_usd))
                } catch {
                    // fallback
                }

                // 2) Ventana de fechas a consultar
                const from = new Date()
                const to = addDays(from, 60)
                const ranges = chunkRanges(from, to, 31)

                // 3) Leer slots disponibles (raw)
                const allSlots = []
                for (const win of ranges) {
                    const qs = new URLSearchParams({
                        doctor_id: String(doctorId),
                        date_from: win.from.toISOString(),
                        date_to: win.to.toISOString(),
                    }).toString()
                    const part = await apiGet(`/availability/slots?${qs}`)
                    if (Array.isArray(part)) allSlots.push(...part)
                }

                // 4) Traer citas/bloqueos del doctor y filtrar solapes en el cliente
                let appts = []
                try {
                    const q2 = new URLSearchParams({
                        doctor_id: String(doctorId),
                        date_from: from.toISOString(),
                        date_to: to.toISOString(),
                    }).toString()
                    appts = await apiGet(`/appointments?${q2}`)
                } catch {
                    appts = []
                }

                const nowMs = Date.now()
                const blockers = (Array.isArray(appts) ? appts : [])
                    .filter((a) => {
                        const st = (a.status || "").toLowerCase()
                        if (st === "confirmed") return true
                        if (st === "pending" || st === "processing") {
                            const huMs = a.hold_until ? new Date(a.hold_until).getTime() : NaN
                            return Number.isFinite(huMs) && huMs > nowMs
                        }
                        return false
                    })
                    .map((a) => ({ start: a.start_at, end: a.end_at }))

                const freeSlots = allSlots.filter((s) => !blockers.some((b) => overlaps(s.start_at, s.end_at, b.start, b.end)))

                if (DEBUG) {
                    // Debug en consola para entender “en qué hora” está comparando
                    const fmt = (iso) => ({
                        iso,
                        hasTZ: hasTZ(iso),
                        asMs: toMs(iso),
                        localGYE: toLocalYMD(iso) + " " + toLocalHM(iso),
                    })

                    console.groupCollapsed("[Schedule DEBUG]")
                    console.log("Ahora (GYE):", nowInGYE().toISOString(), "→", toLocalYMD(nowInGYE().toISOString()), toLocalHM(nowInGYE().toISOString()))
                    console.table((allSlots || []).map(s => ({
                        start_iso: s.start_at, end_iso: s.end_at,
                        start_ms: toMs(s.start_at), end_ms: toMs(s.end_at),
                        start_gye: `${toLocalYMD(s.start_at)} ${toLocalHM(s.start_at)}`,
                        end_gye: `${toLocalYMD(s.end_at)} ${toLocalHM(s.end_at)}`,
                    })))
                    console.table((blockers || []).map(b => ({
                        b_start_iso: b.start, b_end_iso: b.end,
                        b_start_ms: toMs(b.start), b_end_ms: toMs(b.end),
                        b_start_gye: `${toLocalYMD(b.start)} ${toLocalHM(b.start)}`,
                        b_end_gye: `${toLocalYMD(b.end)} ${toLocalHM(b.end)}`,
                    })))
                    console.table((freeSlots || []).map(s => ({
                        free_start_iso: s.start_at, free_end_iso: s.end_at,
                        free_start_ms: toMs(s.start_at), free_end_ms: toMs(s.end_at),
                        free_start_gye: `${toLocalYMD(s.start_at)} ${toLocalHM(s.start_at)}`,
                        free_end_gye: `${toLocalYMD(s.end_at)} ${toLocalHM(s.end_at)}`,
                    })))
                    console.groupEnd()
                }

                if (isMounted) setAvailMap(groupSlotsByDay(freeSlots))
            } catch (err) {
                if (isMounted) setErrorMsg(err?.message || "No se pudo cargar la disponibilidad.")
            } finally {
                if (isMounted) setLoading(false)
            }
        }
        load()

        return () => {
            isMounted = false
        }
    }, [doctorId, sp]) // incluye sp para que cambiar ?debug=1 reactive la carga

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
        for (const ymd of Object.keys(availMapFiltered)) {
            const daySlots = (availMapFiltered[ymd] || []).filter((s) => picked.has(keyOf(s)))
            if (daySlots.length) {
                const sorted = [...daySlots].sort((a, b) => toMs(a.startISO) - toMs(b.startISO))
                out.push({ ymd, slots: sorted })
            }
        }
        // también incluye el día seleccionado actual por si eligió ahí
        if (!out.find((g) => g.ymd === selected)) {
            const daySlots = (selectedSlots || []).filter((s) => picked.has(keyOf(s)))
            if (daySlots.length) out.push({ ymd: selected, slots: daySlots })
        }
        // orden por fecha asc
        out.sort((a, b) => new Date(a.ymd) - new Date(b.ymd))
        return out
    }, [picked, availMapFiltered, selected, selectedSlots])

    const pickedCount = React.useMemo(() => Array.from(picked).length, [picked])
    const totalUSD = React.useMemo(() => (pickedCount * Number(priceUSD)).toFixed(2), [pickedCount, priceUSD])

    const onNext = () => {
        const items = pickedList.flatMap((group) => group.slots.map((s) => ({ start_at: s.startISO, end_at: s.endISO })))
        nav("/paciente/checkout", {
            state: {
                doctorId,
                priceUSD,
                items,
            },
        })
    }

    const Section = ({ title, count, children }) => (
        <div className="mt-4">
            <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
                <span className="text-xs rounded-full bg-gray-100 text-gray-700 px-2 py-0.5">{count}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">{children}</div>
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
                    active ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700" : "border-emerald-200 text-emerald-800 hover:bg-emerald-50",
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
                <h1 className="text-2xl font-bold text-emerald-800">Agendar cita</h1>
                <p className="text-gray-600">Selecciona uno o varios horarios; abajo verás tu selección y el total.</p>
            </div>

            {/* Banner DEBUG opcional */}
            {DEBUG && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2 text-xs flex items-start gap-2">
                    <Info className="h-4 w-4 mt-0.5" />
                    <div>
                        <div><strong>DEBUG</strong> activo: comparaciones en <em>epoch ms</em>.</div>
                        <div>Ahora (GYE): {toLocalYMD(nowInGYE().toISOString())} {toLocalHM(nowInGYE().toISOString())}</div>
                    </div>
                </div>
            )}

            {/* Calendario */}
            <MonthCalendar value={selected} onChange={setSelected} badges={badges} locale="es-EC" minDate={todayYMD()} />

            {/* Horarios del día */}
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-emerald-800">Horarios disponibles — {selected}</h3>
                    <div className="text-xs text-gray-500">Tarifa: ${Number(priceUSD).toFixed(2)} • TZ: América/Guayaquil</div>
                </div>

                {/* Aviso de margen activo */}
                <div className="mt-2 text-xs text-gray-500">No se muestran horarios que inicien en menos de {leadMinutes} minutos desde ahora.</div>

                {errorMsg && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2 text-sm">{errorMsg}</div>}

                {loading ? (
                    <div className="mt-4 text-sm text-gray-500">Cargando horarios…</div>
                ) : (
                    <>
                        {selectedSlots.length === 0 ? (
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
                        {pickedCount} {pickedCount === 1 ? "slot" : "slots"} × ${Number(priceUSD).toFixed(2)} ={" "}
                        <span className="font-semibold text-emerald-700">
                            {(pickedCount * Number(priceUSD)).toFixed(2)}
                        </span>
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setPicked(new Set())}
                            disabled={pickedCount === 0}
                            className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50 disabled:opacity-60"
                            title={pickedCount === 0 ? "No hay nada que limpiar" : "Quitar todos los horarios seleccionados"}
                        >
                            Limpiar selección
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                const items = pickedList.flatMap((group) => group.slots.map((s) => ({ start_at: s.startISO, end_at: s.endISO })))
                                nav("/paciente/checkout", {
                                    state: { doctorId, priceUSD, items },
                                })
                            }}
                            disabled={pickedCount === 0}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-60"
                            title={pickedCount === 0 ? "Selecciona al menos un horario para continuar" : "Continuar al checkout"}
                        >
                            Siguiente paso
                            <ArrowRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
