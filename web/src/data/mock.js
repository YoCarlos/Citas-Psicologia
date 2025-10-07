// Pacientes de ejemplo
export const patients = [
    { id: 1, name: "Carlos Avendaño", email: "carlos@example.com", phone: "+593 98 000 0001" },
    { id: 2, name: "María López", email: "maria@example.com", phone: "+593 98 000 0002" },
    { id: 3, name: "Jorge Paredes", email: "jorge@example.com", phone: "+593 98 000 0003" },
]

export const findPatient = (id) => patients.find(p => p.id === id)

// Citas de ejemplo
export const appointments = [
    { id: 101, date: "2025-09-08", time: "09:00", patientId: 1, status: "confirmada", mode: "Zoom" },
    { id: 102, date: "2025-09-08", time: "11:00", patientId: 2, status: "pendiente_confirmacion", mode: "Zoom" },
    { id: 103, date: "2025-09-08", time: "15:30", patientId: 3, status: "confirmada", mode: "Zoom" },
    { id: 104, date: "2025-09-09", time: "10:00", patientId: 2, status: "confirmada", mode: "Zoom" },
]

// Disponibilidad semanal (ejemplo): Lunes-Viernes 09:00, 10:00, 11:00 y 15:30
// 0=Domingo ... 6=Sábado
export const weeklyAvailability = {
    1: ["09:00", "10:00", "11:00", "15:30"], // Lunes
    2: ["09:00", "10:00", "11:00", "15:30"],
    3: ["09:00", "10:00", "11:00", "15:30"],
    4: ["09:00", "10:00", "11:00", "15:30"],
    5: ["09:00", "10:00", "11:00", "15:30"],
    // Sábado y Domingo sin disponibilidad por ahora
}

// Utilidades de fecha
const pad = (n) => String(n).padStart(2, "0")
const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// Genera slots para los próximos N días, quitando los que ya estén ocupados
export function generateAvailableSlots(days = 14) {
    const today = new Date()
    const busy = new Set(appointments.map(a => `${a.date} ${a.time}`))

    const result = []
    for (let i = 0; i < days; i++) {
        const d = new Date(today)
        d.setDate(today.getDate() + i)
        const dow = d.getDay() // 0..6
        const slots = weeklyAvailability[dow] || []
        const date = toYMD(d)

        const available = slots.filter(t => !busy.has(`${date} ${t}`))
        if (available.length) {
            result.push({ date, times: available })
        } else {
            result.push({ date, times: [] })
        }
    }
    return result
}

// Citas del paciente actual (demo: paciente 1)
export function getPatientAppointments(patientId = 1) {
    const all = appointments.filter(a => a.patientId === patientId)
    const today = new Date().toISOString().slice(0, 10)
    const upcoming = all.filter(a => a.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    const past = all.filter(a => a.date < today).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
    return { upcoming, past }
}

