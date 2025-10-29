// src/pages/paciente/PatientSchedule.jsx
import React from "react"
import MonthCalendar, { toYMD } from "../../components/MonthCalendar"
import { apiGet } from "../../lib/api"
import { getUserFromToken } from "../../lib/auth"
import { Clock4, ArrowRight } from "lucide-react"
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

const toLocalHM = (isoString) =>
    new Date(isoString).toLocaleTimeString("es-EC", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: TZ,
    })

const getLocalHour = (isoString) =>
    Number(new Date(isoString).toLocaleString("en-CA", { hour: "2-digit", hour12: false, timeZone: TZ }))

const toLocalYMD = (isoString) => {
    const d = new Date(isoString)
    const y = d.toLocaleString("en-CA", { year: "numeric", timeZone: TZ })
    const m = d.toLocaleString("en-CA", { month: "2-digit", timeZone: TZ })
    const day = d.toLocaleString("en-CA", { day: "2-digit", timeZone: TZ })
    return `${y}-${m}-${day}`
}

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
        map[k].sort((a, b) => new Date(a.startISO) - new Date(b.startISO))
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

export default function PatientSchedule() {
    const nav = useNavigate()
    const [sp] = useSearchParams()

    const user = getUserFromToken()
    const role = user?.role

    // doctor_id: prioridad querystring > doctor (si es doctora logueada) > doctor asignado al paciente
    const qsDoctorId = sp.get("doctor_id")
    const doctorId = qsDoctorId
        ? Number(qsDoctorId)
        : role === "doctor"
            ? user?.id
            : user?.doctor_id

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
        const now = new Date()
        const minStart = new Date(now.getTime() + leadMs)

        const out = {}
        for (const ymd of Object.keys(availMap)) {
            out[ymd] = (availMap[ymd] || []).filter(s => new Date(s.startISO) >= minStart)
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
    const amSlots = React.useMemo(
        () => selectedSlots.filter((s) => !s.isPM),
        [selectedSlots]
    )
    const pmSlots = React.useMemo(
        () => selectedSlots.filter((s) => s.isPM),
        [selectedSlots]
    )

    // Carga inicial: settings (precio/margen) + 60 días de disponibilidad desde hoy
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
                // 1) Precio de la doctora
                try {
                    const cfg = await apiGet(`/settings/consultation?doctor_id=${doctorId}`)
                    if (isMounted && cfg?.price_usd != null) setPriceUSD(Number(cfg.price_usd))
                } catch (e) {
                    // si 404/500, usamos fallback
                }

                // 2) (Opcional) margen de antelación por doctora
                try {
                    const booking = await apiGet(`/settings/booking?doctor_id=${doctorId}`)
                    if (isMounted && booking?.min_lead_minutes != null) {
                        setLeadMinutes(Number(booking.min_lead_minutes))
                    }
                } catch (e) {
                    // si 404/500, usamos DEFAULT_LEAD_MINUTES
                }

                // 3) Slots
                const from = new Date()
                const to = addDays(from, 60)
                const ranges = chunkRanges(from, to, 31)

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

                if (isMounted) setAvailMap(groupSlotsByDay(allSlots))
            } catch (err) {
                if (isMounted) setErrorMsg(err?.message || "No se pudo cargar la disponibilidad.")
            } finally {
                if (isMounted) setLoading(false)
            }
        }
        load()

        return () => { isMounted = false }
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
        for (const ymd of Object.keys(availMapFiltered)) {
            const daySlots = (availMapFiltered[ymd] || []).filter((s) => picked.has(keyOf(s)))
            if (daySlots.length) {
                const sorted = [...daySlots].sort((a, b) => new Date(a.startISO) - new Date(b.startISO))
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

    const pickedCount = React.useMemo(
        () => Array.from(picked).length,
        [picked]
    )

    const totalUSD = React.useMemo(
        () => (pickedCount * Number(priceUSD)).toFixed(2),
        [pickedCount, priceUSD]
    )

    const onNext = () => {
        const items = pickedList.flatMap(group =>
            group.slots.map(s => ({ start_at: s.startISO, end_at: s.endISO }))
        )
        nav("/paciente/checkout", {
            state: {
                doctorId,
                priceUSD,
                items,
            },
        })
    }

    const clearPicked = () => setPicked(new Set())

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
                        : "border-emerald-200 text-emerald-800 hover:bg-emerald-50"
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

            {/* Calendario */}
            <MonthCalendar
                value={selected}
                onChange={setSelected}
                badges={badges}
                locale="es-EC"
                minDate={todayYMD()} // deshabilita pasados
            />

            {/* Horarios del día */}
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-emerald-800">Horarios disponibles — {selected}</h3>
                    <div className="text-xs text-gray-500">
                        Tarifa: ${Number(priceUSD).toFixed(2)} • TZ: América/Guayaquil
                    </div>
                </div>

                {/* Aviso de margen activo */}
                <div className="mt-2 text-xs text-gray-500">
                    No se muestran horarios que inicien en menos de {leadMinutes} minutos desde ahora.
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
                        <span className="font-semibold text-emerald-700">${totalUSD}</span>
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={clearPicked}
                            disabled={pickedCount === 0}
                            className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50 disabled:opacity-60"
                            title={pickedCount === 0 ? "No hay nada que limpiar" : "Quitar todos los horarios seleccionados"}
                        >
                            Limpiar selección
                        </button>

                        <button
                            type="button"
                            onClick={onNext}
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
