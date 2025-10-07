import React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

// ====== Utilidades de fecha (LOCAL, sin UTC) ======
const pad = (n) => String(n).padStart(2, "0")
export function toYMD(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
// Parse local: "YYYY-MM-DD" -> new Date(y, m-1, d) (¡evita el bug UTC!)
export function parseYMD(s) {
    if (!s) return null
    const [y, m, d] = s.split("-").map(Number)
    return new Date(y, m - 1, d)
}
function isSameDate(a, b) {
    return !!a && !!b &&
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
}

// Monday-first helpers
function firstCellOfMonthGrid(year, month /* 0..11 */) {
    const first = new Date(year, month, 1)
    const weekday = (first.getDay() + 6) % 7 // 0=Lunes .. 6=Domingo
    return new Date(year, month, 1 - weekday)
}

export default function MonthCalendar({
    value,              // string YYYY-MM-DD
    onChange,           // (dateString) => void
    badges = {},        // { "YYYY-MM-DD": number }
    locale = "es-EC",
    minDate,            // string YYYY-MM-DD (deshabilitar fechas anteriores)
    disabledDates = new Set(), // Set<string YMD>
}) {
    const today = new Date()
    const selected = parseYMD(value) ?? today
    const [cursor, setCursor] = React.useState(new Date(selected.getFullYear(), selected.getMonth(), 1))
    const minLocal = minDate ? parseYMD(minDate) : null

    const firstCell = firstCellOfMonthGrid(cursor.getFullYear(), cursor.getMonth())
    const weeks = []
    let d = new Date(firstCell)
    for (let w = 0; w < 6; w++) {
        const row = []
        for (let i = 0; i < 7; i++) {
            row.push(new Date(d))
            d.setDate(d.getDate() + 1)
        }
        weeks.push(row)
    }

    const monthLabel = cursor.toLocaleDateString(locale, { month: "long", year: "numeric" })

    return (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <button
                    className="p-2 rounded-lg hover:bg-gray-100"
                    onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                    aria-label="Mes anterior"
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="font-semibold capitalize">{monthLabel}</div>
                <button
                    className="p-2 rounded-lg hover:bg-gray-100"
                    onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                    aria-label="Mes siguiente"
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>

            {/* Weekdays */}
            <div className="grid grid-cols-7 text-xs text-gray-500 mb-1">
                {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((w) => (
                    <div key={w} className="py-1 text-center">{w}</div>
                ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7 gap-1">
                {weeks.flat().map((day, idx) => {
                    const inMonth = day.getMonth() === cursor.getMonth()
                    const isToday = isSameDate(day, today)
                    const isSelected = isSameDate(day, selected)
                    const ymd = toYMD(day)
                    const badge = badges[ymd] || 0

                    const isBeforeMin = minLocal ? day < new Date(minLocal.getFullYear(), minLocal.getMonth(), minLocal.getDate()) : false
                    const isDisabled = isBeforeMin || disabledDates.has(ymd)

                    return (
                        <button
                            key={idx}
                            onClick={() => !isDisabled && inMonth && onChange?.(ymd)}
                            disabled={isDisabled || !inMonth}
                            className={[
                                "relative aspect-square rounded-xl p-2 text-sm text-left border",
                                inMonth ? "bg-white hover:bg-emerald-50" : "bg-gray-50 text-gray-400",
                                isSelected ? "ring-2 ring-emerald-300 border-emerald-400" : "border-gray-200",
                                isToday ? "outline outline-1 outline-emerald-200" : "",
                                isDisabled ? "opacity-40 cursor-not-allowed" : ""
                            ].join(" ")}
                        >
                            <div className="font-medium">{day.getDate()}</div>
                            {badge > 0 && (
                                <span className="absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-600 text-white">
                                    {badge}
                                </span>
                            )}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
