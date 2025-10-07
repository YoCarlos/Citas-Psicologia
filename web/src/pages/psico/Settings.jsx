// src/pages/psico/Settings.jsx
import React from "react"
import { Plus, Trash2, Save, DollarSign, Timer, AlertTriangle } from "lucide-react"
import { apiGet, apiPut } from "../../lib/api.js"
import { getUserFromToken } from "../../lib/auth.js"

const WEEKDAYS = [
    { key: 1, label: "Lunes" },
    { key: 2, label: "Martes" },
    { key: 3, label: "Miércoles" },
    { key: 4, label: "Jueves" },
    { key: 5, label: "Viernes" },
    { key: 6, label: "Sábado" },
    { key: 0, label: "Domingo" },
]

const DURATIONS = [30, 45, 50, 60, 75, 90]

// genera horas en intervalos de 30 min (UI)
function timeOptions(stepMin = 30) {
    const out = []
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += stepMin) {
            out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`)
        }
    }
    return out
}
const TIMES = timeOptions(30)

function toMinutes(hhmm) {
    const [h, m] = hhmm.split(":").map(Number)
    return h * 60 + m
}
function fromMinutes(min) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}
function overlaps(a, b) {
    // a y b: {start, end} en HH:MM
    const as = toMinutes(a.start)
    const ae = toMinutes(a.end)
    const bs = toMinutes(b.start)
    const be = toMinutes(b.end)
    return as < be && ae > bs
}
function hasAnyOverlap(ranges, ignoreIndex = -1) {
    const arr = ranges.map((r, i) => ({ ...r, __i: i })).filter(r => toMinutes(r.end) > toMinutes(r.start))
    for (let i = 0; i < arr.length; i++) {
        if (arr[i].__i === ignoreIndex) continue
        for (let j = i + 1; j < arr.length; j++) {
            if (arr[j].__i === ignoreIndex) continue
            if (overlaps(arr[i], arr[j])) return true
        }
    }
    return false
}

// Select bonito (Tailwind)
function PrettySelect({ value, onChange, children, className = "", ...props }) {
    return (
        <div className={`relative inline-block ${className}`}>
            <select
                value={value}
                onChange={onChange}
                className="appearance-none pr-8 pl-3 py-2 rounded-lg border border-emerald-200 bg-white text-gray-800 shadow-sm
                   focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition"
                {...props}
            >
                {children}
            </select>
            <svg
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500"
                viewBox="0 0 20 20" fill="currentColor"
            >
                <path d="M10 12l-4-4h8l-4 4z" />
            </svg>
        </div>
    )
}

function TimeRangeRow({ value, onChange, onRemove, durationMin, otherRanges = [] }) {
    // limitar inicios para que siempre exista un fin ≥ inicio+duración
    const latestStartMin = (24 * 60) - durationMin
    const startOptions = TIMES.filter((t) => toMinutes(t) <= latestStartMin)

    const minEndMin = toMinutes(value.start) + durationMin
    const endOptions = TIMES.filter((t) => toMinutes(t) >= minEndMin)

    // si el end actual quedó fuera de las opciones (p.ej. al mover start),
    // lo corregimos al último fin válido cercano (no "23:59")
    const currentEndMin = toMinutes(value.end)
    const endValue =
        currentEndMin >= minEndMin
            ? value.end
            : (endOptions[0] || TIMES[TIMES.length - 1]) // último válido de la lista

    // helpers de actualización con validación anti-solapes
    const tryUpdate = (next) => {
        // no permitir rangos con duración menor a durationMin
        if (toMinutes(next.end) - toMinutes(next.start) < durationMin) return false
        // no permitir solapes con otras franjas del día
        const shadow = [...otherRanges, next]
        if (hasAnyOverlap(shadow, -1)) return false
        onChange(next)
        return true
    }

    return (
        <div className="flex gap-2 items-center">
            <PrettySelect
                value={value.start}
                onChange={(e) => {
                    const nextStart = e.target.value
                    const nextMinEnd = toMinutes(nextStart) + durationMin
                    const nextEnd = toMinutes(endValue) >= nextMinEnd
                        ? endValue
                        : (TIMES.find((t) => toMinutes(t) >= nextMinEnd) || TIMES[TIMES.length - 1])

                    const proposal = { start: nextStart, end: nextEnd }
                    // validar anti-solape
                    if (!tryUpdate(proposal)) {
                        // Si no se puede por solape, intenta "snap" al primer hueco disponible
                        // recorremos ends posibles desde nextMinEnd y probamos
                        const candidates = TIMES.filter(t => toMinutes(t) >= nextMinEnd)
                        for (const candEnd of candidates) {
                            if (tryUpdate({ start: nextStart, end: candEnd })) return
                        }
                        // si no hay hueco, no cambiamos (dejamos el valor previo)
                    }
                }}
            >
                {startOptions.map((t) => (
                    <option key={`s-${t}`} value={t}>{t}</option>
                ))}
            </PrettySelect>

            <span className="text-gray-500">—</span>

            <PrettySelect
                value={endValue}
                onChange={(e) => {
                    const proposal = { start: value.start, end: e.target.value }
                    tryUpdate(proposal) // si no es válido, simplemente no aplica el cambio
                }}
            >
                {endOptions.map((t) => (
                    <option key={`e-${t}`} value={t}>{t}</option>
                ))}
            </PrettySelect>

            <button
                type="button"
                onClick={onRemove}
                className="p-2 rounded-lg border border-rose-200 hover:bg-rose-50"
                title="Eliminar franja"
            >
                <Trash2 className="h-4 w-4 text-rose-600" />
            </button>
        </div>
    )
}

export default function PsicoSettings() {
    const user = getUserFromToken()
    const doctorId = user?.id

    const [duration, setDuration] = React.useState(50) // minutos
    const [priceUSD, setPriceUSD] = React.useState(35)
    const [loading, setLoading] = React.useState(false)
    const [okMsg, setOkMsg] = React.useState("")
    const [errorMsg, setErrorMsg] = React.useState("")

    const [availability, setAvailability] = React.useState(() => {
        const base = { enabled: true, ranges: [{ start: "09:00", end: "12:00" }, { start: "15:00", end: "17:00" }] }
        const off = { enabled: false, ranges: [] }
        return { 1: base, 2: base, 3: base, 4: base, 5: base, 6: off, 0: off }
    })

    const weekdayLabel = (k) => WEEKDAYS.find((d) => d.key === k)?.label ?? k
    const updateDay = (dayKey, patch) =>
        setAvailability((prev) => ({ ...prev, [dayKey]: { ...prev[dayKey], ...patch } }))

    const addRange = (dayKey) => {
        const day = availability[dayKey] || { enabled: false, ranges: [] }
        const ranges = [...(day.ranges ?? [])]

        // intenta proponer un hueco (p.ej. desde 09:00 en adelante) que no solape
        const starts = TIMES
        for (const s of starts) {
            const eMin = toMinutes(s) + duration
            const e = TIMES.find((t) => toMinutes(t) >= eMin)
            if (!e) continue
            const proposal = { start: s, end: e }
            const shadow = [...ranges, proposal]
            if (!hasAnyOverlap(shadow)) {
                updateDay(dayKey, { ranges: [...ranges, proposal] })
                return
            }
        }
        // si no encontró hueco
        setErrorMsg(`No hay espacio disponible para añadir una franja en ${weekdayLabel(Number(dayKey))}.`)
    }

    const updateRange = (dayKey, idx, next) => {
        const day = availability[dayKey] || { enabled: false, ranges: [] }
        const ranges = [...(day.ranges ?? [])]
        ranges[idx] = next
        // validación anti-solape (ignora idx actual)
        if (hasAnyOverlap(ranges)) {
            setErrorMsg(`Las franjas no pueden solaparse en ${weekdayLabel(Number(dayKey))}.`)
            return
        }
        updateDay(dayKey, { ranges })
    }

    const removeRange = (dayKey, idx) => {
        const ranges = (availability[dayKey]?.ranges ?? []).filter((_, i) => i !== idx)
        updateDay(dayKey, { ranges })
    }

    // CARGA settings + availability
    React.useEffect(() => {
        if (!doctorId) return
        const load = async () => {
            setLoading(true)
            setErrorMsg("")
            try {
                // 1) Cargar configuración (duración y costo)
                try {
                    const cfg = await apiGet(`/settings/consultation?doctor_id=${doctorId}`)
                    setDuration(cfg.duration_min)
                    setPriceUSD(Number(cfg.price_usd))
                } catch (e) {
                    if (String(e?.message || "").includes("404")) {
                        // sin config previa: usa defaults
                    } else {
                        throw e
                    }
                }

                // 2) Cargar reglas semanales
                const data = await apiGet(`/availability/weekly?doctor_id=${doctorId}`)
                setAvailability((prev) => {
                    const next = { ...prev }
                    for (const r of data ?? []) {
                        next[r.weekday] = { enabled: r.enabled, ranges: r.ranges ?? [] }
                    }
                    return next
                })
            } catch (err) {
                setErrorMsg(err?.message || "No se pudo cargar la configuración.")
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [doctorId])

    const handleSave = async () => {
        setErrorMsg("")
        setOkMsg("")
        // 1) Validación local: duración mínima y SIN solapes
        for (const k of Object.keys(availability)) {
            const day = availability[k]
            if (!day?.enabled) continue
            // duración mínima
            for (const r of day.ranges ?? []) {
                if (toMinutes(r.end) - toMinutes(r.start) < duration) {
                    setErrorMsg(`Revisa ${weekdayLabel(Number(k))}: la franja debe ser al menos de ${duration} minutos.`)
                    return
                }
            }
            // solapes
            if (hasAnyOverlap(day.ranges ?? [])) {
                setErrorMsg(`Revisa ${weekdayLabel(Number(k))}: hay franjas que se solapan.`)
                return
            }
        }

        setLoading(true)
        try {
            // 2) Guardar settings de consulta
            await apiPut(`/settings/consultation`, {
                doctor_id: doctorId,
                duration_min: duration,
                price_usd: Number(priceUSD),
            })

            // 3) Guardar reglas semanales
            const rules = Object.entries(availability).map(([weekday, v]) => ({
                doctor_id: doctorId,
                weekday: Number(weekday),
                enabled: Boolean(v?.enabled),
                ranges: (v?.ranges ?? []).map((r) => ({ start: r.start, end: r.end })),
            }))
            await apiPut(`/availability/weekly/bulk`, { doctor_id: doctorId, rules })

            setOkMsg("Configuración guardada correctamente.")
        } catch (err) {
            setErrorMsg(err?.message || "No se pudo guardar la configuración.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-emerald-800">Configuración</h1>
                <p className="text-gray-600">Define tu disponibilidad semanal, duración de las sesiones y costos.</p>
            </div>

            {/* Mensajes */}
            {errorMsg && (
                <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2 text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    <span>{errorMsg}</span>
                </div>
            )}
            {okMsg && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">
                    {okMsg}
                </div>
            )}

            {/* Duración y costos */}
            <section className="rounded-2xl bg-white p-5 border border-emerald-100 shadow-sm">
                <h2 className="font-semibold text-emerald-800 flex items-center gap-2">
                    <Timer className="h-4 w-4" /> Duración & Costos
                </h2>
                <div className="mt-4 grid sm:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Duración de la sesión</label>
                        <PrettySelect
                            value={duration}
                            onChange={(e) => setDuration(Number(e.target.value))}
                            className="w-full mt-1"
                        >
                            {DURATIONS.map((d) => (
                                <option key={d} value={d}>{d} min</option>
                            ))}
                        </PrettySelect>
                        <p className="mt-1 text-xs text-gray-500">Los bloques deben ser ≥ a la duración seleccionada.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Precio base (USD)</label>
                        <div className="mt-1 flex items-center gap-2">
                            <span className="inline-flex items-center justify-center h-10 w-10 rounded-lg border bg-gray-50">
                                <DollarSign className="h-4 w-4 text-gray-600" />
                            </span>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="w-full rounded-lg border border-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                                value={priceUSD}
                                onChange={(e) => setPriceUSD(e.target.value)}
                                placeholder="35.00"
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Disponibilidad semanal */}
            <section className="rounded-2xl bg-white p-5 border border-blue-100 shadow-sm">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-blue-800">Disponibilidad semanal</h2>
                    {loading && <span className="text-sm text-gray-500">Cargando…</span>}
                </div>
                <p className="text-sm text-gray-600 mt-1">
                    Define los bloques de tiempo donde aceptas citas. Las horas reales disponibles se construirán con base en esta plantilla,
                    la duración de la sesión y las citas ya ocupadas.
                </p>

                <div className="mt-4 space-y-4">
                    {WEEKDAYS.map(({ key, label }) => {
                        const day = availability[key] || { enabled: false, ranges: [] }
                        return (
                            <div key={key} className="rounded-xl border p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            checked={day.enabled}
                                            onChange={(e) => updateDay(key, { enabled: e.target.checked })}
                                        />
                                        <div className="font-medium">{label}</div>
                                    </div>
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-sm"
                                        onClick={() => addRange(key)}
                                        disabled={!day.enabled}
                                    >
                                        <Plus className="h-4 w-4" />
                                        Añadir franja
                                    </button>
                                </div>

                                <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {(day.ranges?.length ?? 0) === 0 && (
                                        <div className="text-sm text-gray-500">Sin franjas para este día.</div>
                                    )}
                                    {(day.ranges ?? []).map((r, i) => {
                                        const otherRanges = (day.ranges ?? []).filter((_, j) => j !== i)
                                        return (
                                            <TimeRangeRow
                                                key={i}
                                                value={r}
                                                durationMin={duration}
                                                otherRanges={otherRanges}
                                                onChange={(next) => updateRange(key, i, next)}
                                                onRemove={() => removeRange(key, i)}
                                            />
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </section>

            {/* Guardar */}
            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={loading || !doctorId}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-60"
                >
                    <Save className="h-4 w-4" />
                    {loading ? "Guardando..." : "Guardar configuración"}
                </button>
            </div>
        </div>
    )
}
