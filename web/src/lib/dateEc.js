// Utilidades de fecha robustas para Ecuador (America/Guayaquil)
export const TZ = "America/Guayaquil"

// Normaliza ISO a UTC: "+00:00" -> "Z"; sin zona -> agrega "Z"
export const normalizeIso = (v) => {
    if (typeof v !== "string") return v
    if (v.endsWith("Z")) return v
    if (/[+-]00:?00$/.test(v)) return v.replace(/[+-]00:?00$/, "Z")
    const m = v.match(/\.\d{1,6}([+-]00:?00)$/)
    if (m) return v.replace(m[1], "Z")
    return `${v}Z`
}

// Devuelve Date válido o null. Acepta string, Date, number.
// Incluye logs para depurar.
export const parseUTC = (val, ctx = "parseUTC") => {
    try {
        if (val === null || val === undefined) {
            console.warn(`[${ctx}] null/undefined`, val)
            return null
        }
        if (val instanceof Date) return Number.isFinite(val.getTime()) ? val : null
        if (typeof val === "number") {
            const d = new Date(val)
            return Number.isFinite(d.getTime()) ? d : null
        }
        if (typeof val === "string") {
            const s = normalizeIso(val)
            const t = Date.parse(s)
            if (Number.isFinite(t)) return new Date(t)
            console.warn(`[${ctx}] string inválido`, { original: val, normalizado: s })
            return null
        }
        console.warn(`[${ctx}] tipo no soportado`, typeof val, val)
        return null
    } catch (e) {
        console.error(`[${ctx}] excepción parseando`, val, e)
        return null
    }
}

// Offset (ms) de una zona horaria para una fecha.
export const tzOffsetMs = (timeZone, date = new Date()) => {
    const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    })
    const map = Object.fromEntries(dtf.formatToParts(date).map(p => [p.type, p.value]))
    const asUTC = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second)
    return asUTC - date.getTime()
}

// Inicio de día (00:00) en la TZ dada, como instante UTC.
export const startOfDayInTZ = (timeZone, date = new Date()) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
        .formatToParts(date).reduce((acc, p) => (acc[p.type] = p.value, acc), {})
    const y = +parts.year, m = +parts.month, d = +parts.day
    const approxUTC = Date.UTC(y, m - 1, d, 0, 0, 0)
    const off = tzOffsetMs(timeZone, new Date(approxUTC))
    return new Date(approxUTC - off)
}

export const addDays = (date, n) => new Date(date.getTime() + n * 86400_000)

// Formatters en EC
const FMT_YMD = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
const FMT_YM = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" })
const FMT_HM = new Intl.DateTimeFormat("es-EC", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false })
const FMT_MON = new Intl.DateTimeFormat("es-EC", { timeZone: TZ, month: "long", year: "numeric" })

// Wrappers seguros
export const fmtYMD = (v, ctx = "fmtYMD") => { const d = parseUTC(v, ctx); return d ? FMT_YMD.format(d) : "—" }
export const fmtHM = (v, ctx = "fmtHM") => { const d = parseUTC(v, ctx); return d ? FMT_HM.format(d) : "—" }
export const monthKeyOf = (v, ctx = "monthKey") => { const d = parseUTC(v, ctx); return d ? FMT_YM.format(d) : "0000-00" }
export const monthLabel = (key) => {
    const [y, m] = String(key || "").split("-").map(n => parseInt(n, 10))
    if (!y || !m) return "—"
    return FMT_MON.format(new Date(Date.UTC(y, m - 1, 1)))
}
