// src/pages/psico/Patients.jsx
import React, { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { UserPlus, CalendarDays, FileText, ClipboardCheck } from "lucide-react"
import { apiGet } from "../../lib/api"
import { getUserFromToken } from "../../lib/auth"

const TZ = "America/Guayaquil"

// -------- helpers de fecha/hora --------
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

// --------- Modal base ----------
function Modal({ open, onClose, title, children, footer }) {
    if (!open) return null
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/30" onClick={onClose} />
            <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl border p-5">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-2 py-1 rounded-md text-gray-500 hover:bg-gray-100"
                    >
                        ✕
                    </button>
                </div>
                <div className="mt-3">{children}</div>
                {footer ? <div className="mt-5">{footer}</div> : null}
            </div>
        </div>
    )
}

export default function Patients() {
    const me = getUserFromToken()
    const doctorId = useMemo(() => (me?.role === "doctor" ? me?.id : null), [me])

    const [rows, setRows] = useState([])
    const [loading, setLoading] = useState(true)
    const [err, setErr] = useState("")

    // Modal de info paciente
    const [openInfo, setOpenInfo] = useState(false)
    const [infoLoading, setInfoLoading] = useState(false)
    const [infoErr, setInfoErr] = useState("")
    const [userInfo, setUserInfo] = useState(null) // /users/{id}
    const [profile, setProfile] = useState(null)   // /patients/{id}

    // Modal de citas del paciente
    const [openAppts, setOpenAppts] = useState(false)
    const [apptsLoading, setApptsLoading] = useState(false)
    const [apptsErr, setApptsErr] = useState("")
    const [appts, setAppts] = useState([])

    useEffect(() => {
        let isMounted = true
        async function load() {
            setLoading(true)
            setErr("")
            try {
                const qp = new URLSearchParams()
                qp.set("skip", "0")
                qp.set("limit", "500")
                qp.set("role", "patient")
                if (doctorId) qp.set("doctor_id", String(doctorId))
                const serverList = await apiGet(`/users?${qp.toString()}`)
                const filtered = Array.isArray(serverList)
                    ? serverList.filter(
                        (u) => u.role === "patient" && (doctorId ? u.doctor_id === doctorId : true)
                    )
                    : []
                if (isMounted) setRows(filtered)
            } catch (e) {
                if (isMounted) setErr(e.message || "No se pudo cargar la lista de pacientes.")
            } finally {
                if (isMounted) setLoading(false)
            }
        }
        if (doctorId) load()
        else {
            setErr("Tu sesión no corresponde a una doctora.")
            setLoading(false)
        }
        return () => {
            isMounted = false
        }
    }, [doctorId])

    // Abrir modal de info de paciente
    const openPatientInfo = async (patientId) => {
        setOpenInfo(true)
        setInfoLoading(true)
        setInfoErr("")
        setUserInfo(null)
        setProfile(null)
        try {
            const u = await apiGet(`/users/${patientId}`)
            setUserInfo(u || null)
            try {
                const pr = await apiGet(`/patients/${patientId}`) // perfil extra
                setProfile(pr || null)
            } catch {
                setProfile(null)
            }
        } catch (e) {
            setInfoErr(e?.message || "No se pudo cargar la información del paciente.")
        } finally {
            setInfoLoading(false)
        }
    }

    // Abrir modal de citas del paciente
    const openPatientAppts = async (patientId) => {
        setOpenAppts(true)
        setApptsLoading(true)
        setApptsErr("")
        setAppts([])
        try {
            const qp = new URLSearchParams({
                patient_id: String(patientId),
                doctor_id: String(doctorId ?? ""),
                limit: "500",
            }).toString()
            const list = await apiGet(`/appointments?${qp}`)
            const arr = Array.isArray(list) ? list : []
            arr.sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
            setAppts(arr)
        } catch (e) {
            setApptsErr(e?.message || "No se pudieron cargar las citas del paciente.")
        } finally {
            setApptsLoading(false)
        }
    }

    // Agrupar citas por fecha local para modal
    const groupedAppts = useMemo(() => {
        const map = {}
        for (const a of appts) {
            const ymd = toLocalYMD(a.start_at)
            if (!map[ymd]) map[ymd] = []
            map[ymd].push(a)
        }
        for (const k of Object.keys(map)) {
            map[k].sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
        }
        return map
    }, [appts])
    const apptDates = useMemo(() => Object.keys(groupedAppts).sort(), [groupedAppts])

    return (
        <div className="rounded-2xl bg-white p-5 border border-emerald-100 shadow-sm">
            <div className="flex items-center justify-between">
                <h3 className="font-bold text-emerald-800">Pacientes</h3>
                <Link
                    to="/psico/pacientes/registrar"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
                >
                    <UserPlus className="h-4 w-4" /> Registrar paciente
                </Link>
            </div>

            {/* estados */}
            {loading && <div className="mt-4 text-sm text-gray-500">Cargando pacientes…</div>}
            {err && !loading && (
                <div className="mt-4 text-sm rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2">
                    {err}
                </div>
            )}

            {!loading && !err && (
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-gray-500 border-b">
                                <th className="py-2">Nombre</th>
                                <th className="py-2">Email</th>
                                <th className="py-2"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {rows.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="py-6 text-center text-gray-500">
                                        No tienes pacientes registrados aún.
                                    </td>
                                </tr>
                            ) : (
                                rows.map((p) => (
                                    <tr key={p.id}>
                                        <td className="py-2">
                                            <button
                                                type="button"
                                                onClick={() => openPatientInfo(p.id)}
                                                className="text-emerald-700 hover:underline font-medium"
                                                title="Ver información del paciente"
                                            >
                                                {p.name}
                                            </button>
                                        </td>
                                        <td className="py-2">{p.email}</td>
                                        <td className="py-2">
                                            <div className="flex gap-2">
                                                <Link
                                                    to={`/psico/pacientes/${p.id}/historia`}
                                                    className="inline-flex items-center gap-2 px-3 py-1 rounded-lg border hover:bg-gray-50"
                                                    title="Ver historia clínica"
                                                >
                                                    <FileText className="h-4 w-4" /> Historia
                                                </Link>
                                                <Link
                                                    to={`/psico/pacientes/${p.id}/plan`}
                                                    className="inline-flex items-center gap-2 px-3 py-1 rounded-lg border hover:bg-gray-50"
                                                    title="Ver plan terapéutico"
                                                >
                                                    <ClipboardCheck className="h-4 w-4" /> Plan
                                                </Link>
                                                <button
                                                    type="button"
                                                    onClick={() => openPatientAppts(p.id)}
                                                    className="inline-flex items-center gap-2 px-3 py-1 rounded-lg border hover:bg-gray-50"
                                                    title="Ver citas"
                                                >
                                                    <CalendarDays className="h-4 w-4" /> Citas
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal: información del paciente */}
            <Modal
                open={openInfo}
                onClose={() => setOpenInfo(false)}
                title={userInfo?.name || "Paciente"}
                footer={
                    <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-500">
                            Registrado: {userInfo?.created_at ? toLocalYMD(userInfo.created_at) : "-"}
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    if (userInfo?.id) openPatientAppts(userInfo.id)
                                }}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-gray-700 hover:bg-gray-50 text-sm"
                            >
                                <CalendarDays className="h-4 w-4" />
                                Ver citas
                            </button>
                            <button
                                type="button"
                                onClick={() => setOpenInfo(false)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                }
            >
                {infoLoading ? (
                    <div className="text-sm text-gray-500">Cargando información…</div>
                ) : infoErr ? (
                    <div className="text-sm rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2">
                        {infoErr}
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="rounded-xl border p-3">
                            <div className="text-gray-500 text-sm">Correo</div>
                            <div className="font-medium">{userInfo?.email || "-"}</div>
                        </div>

                        <div className="rounded-xl border p-3">
                            <div className="text-gray-500 text-sm">Región</div>
                            <div className="font-medium">{userInfo?.region || "-"}</div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl border p-3">
                                <div className="text-gray-500 text-sm">Residencia</div>
                                <div className="font-medium">{profile?.residence || "-"}</div>
                            </div>
                            <div className="rounded-xl border p-3">
                                <div className="text-gray-500 text-sm">WhatsApp</div>
                                <div className="font-medium">{profile?.whatsapp || "-"}</div>
                            </div>
                            <div className="col-span-2 rounded-xl border p-3">
                                <div className="text-gray-500 text-sm">Contacto de emergencia</div>
                                <div className="font-medium">{profile?.emergency_contact || "-"}</div>
                            </div>
                            <div className="col-span-2 rounded-xl border p-3">
                                <div className="text-gray-500 text-sm">Motivo / Razón</div>
                                <div className="font-medium">{profile?.reason || "-"}</div>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Modal: citas del paciente */}
            <Modal
                open={openAppts}
                onClose={() => setOpenAppts(false)}
                title={`Citas de ${userInfo?.name || "paciente"}`}
                footer={
                    <div className="flex items-center justify-end">
                        <button
                            type="button"
                            onClick={() => setOpenAppts(false)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
                        >
                            Cerrar
                        </button>
                    </div>
                }
            >
                {apptsLoading ? (
                    <div className="text-sm text-gray-500">Cargando citas…</div>
                ) : apptsErr ? (
                    <div className="text-sm rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2">
                        {apptsErr}
                    </div>
                ) : (() => {
                    const dates = Object.keys(groupedAppts).sort()
                    if (dates.length === 0) {
                        return <div className="text-sm text-gray-500">No tiene citas registradas.</div>
                    }
                    return (
                        <div className="space-y-4">
                            {dates.map((d) => (
                                <div key={d} className="rounded-xl border p-3">
                                    <div className="font-semibold text-emerald-700">{d}</div>
                                    <div className="mt-2 space-y-2">
                                        {groupedAppts[d].map((a) => (
                                            <div
                                                key={a.id}
                                                className="flex items-center justify-between rounded-lg border p-2"
                                            >
                                                <div>
                                                    <div className="font-medium">
                                                        {toLocalHM(a.start_at)}–{toLocalHM(a.end_at)}
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                        #{a.id} • Estado: {a.status}
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
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                })()}
            </Modal>
        </div>
    )
}
