// src/pages/paciente/PatientSettings.jsx
import React from "react"
import { apiGet, apiPut, apiPost } from "../../lib/api"
import { getUserFromToken } from "../../lib/auth"

const TZ = "America/Guayaquil"

const toLocalYMD = (iso) => {
    if (!iso) return "-"
    const d = new Date(iso)
    const y = d.toLocaleString("en-CA", { year: "numeric", timeZone: TZ })
    const m = d.toLocaleString("en-CA", { month: "2-digit", timeZone: TZ })
    const day = d.toLocaleString("en-CA", { day: "2-digit", timeZone: TZ })
    return `${y}-${m}-${day}`
}

const REGIONS = [
    { value: "south_america", label: "Sudamérica" },
    { value: "north_america", label: "Norteamérica" },
    { value: "central_america", label: "Centroamérica" },
    { value: "europe", label: "Europa" },
    { value: "asia", label: "Asia" },
    { value: "africa", label: "África" },
    { value: "oceania", label: "Oceanía" },
    { value: "other", label: "Otra" },
]

export default function PatientSettings() {
    const me = getUserFromToken() // { id, role, name, email, ... }
    const myId = me?.id

    const [loading, setLoading] = React.useState(true)
    const [err, setErr] = React.useState("")
    const [ok, setOk] = React.useState("")

    // user
    const [name, setName] = React.useState("")
    const [email, setEmail] = React.useState("")
    const [region, setRegion] = React.useState("")
    const [createdAt, setCreatedAt] = React.useState("")

    // profile
    const [residence, setResidence] = React.useState("")
    const [whatsapp, setWhatsapp] = React.useState("")
    const [emergency, setEmergency] = React.useState("")
    const [reason, setReason] = React.useState("")

    // control
    const [savingUser, setSavingUser] = React.useState(false)
    const [savingProfile, setSavingProfile] = React.useState(false)
    const [profileExists, setProfileExists] = React.useState(true) // si 404 -> false

    React.useEffect(() => {
        let mounted = true
        async function load() {
            if (!myId) {
                setErr("No se encontró tu sesión.")
                setLoading(false)
                return
            }
            setLoading(true)
            setErr("")
            setOk("")
            try {
                // Cargar usuario
                const u = await apiGet(`/users/${myId}`)
                if (mounted && u) {
                    setName(u.name ?? "")
                    setEmail(u.email ?? "")
                    setRegion(u.region ?? "")
                    setCreatedAt(u.created_at ?? "")
                }

                // Cargar perfil
                try {
                    const p = await apiGet(`/patients/${myId}`)
                    if (mounted && p) {
                        setProfileExists(true)
                        setResidence(p.residence ?? "")
                        setWhatsapp(p.whatsapp ?? "")
                        setEmergency(p.emergency_contact ?? "")
                        setReason(p.reason ?? "")
                    }
                } catch (e) {
                    // Si 404, perfil inexistente => inic vacío
                    setProfileExists(false)
                    setResidence("")
                    setWhatsapp("")
                    setEmergency("")
                    setReason("")
                }
            } catch (e) {
                if (mounted) setErr(e?.message || "No se pudo cargar tu configuración.")
            } finally {
                if (mounted) setLoading(false)
            }
        }
        load()
        return () => {
            mounted = false
        }
    }, [myId])

    const validateEmail = (val) => /\S+@\S+\.\S+/.test(val)

    const saveUser = async (e) => {
        e?.preventDefault?.()
        setOk("")
        setErr("")
        if (!name.trim()) {
            setErr("El nombre no puede estar vacío.")
            return
        }
        if (!validateEmail(email)) {
            setErr("El email no tiene un formato válido.")
            return
        }
        if (region && !REGIONS.find((r) => r.value === region)) {
            setErr("La región seleccionada no es válida.")
            return
        }

        setSavingUser(true)
        try {
            await apiPut(`/users/${myId}`, {
                name: name.trim(),
                email: email.trim(),
                region: region || null,
            })
            setOk("Datos guardados correctamente.")
        } catch (e) {
            setErr(e?.message || "No se pudieron guardar tus datos.")
        } finally {
            setSavingUser(false)
        }
    }

    const saveProfile = async (e) => {
        e?.preventDefault?.()
        setOk("")
        setErr("")
        setSavingProfile(true)
        try {
            if (profileExists) {
                await apiPut(`/patients/${myId}`, {
                    residence: residence || null,
                    emergency_contact: emergency || null,
                    whatsapp: whatsapp || null,
                    reason: reason || null,
                })
            } else {
                // crear si no existe
                await apiPost(`/patients`, {
                    user_id: myId,
                    residence: residence || null,
                    emergency_contact: emergency || null,
                    whatsapp: whatsapp || null,
                    reason: reason || null,
                })
                setProfileExists(true)
            }
            setOk("Información guardada correctamente.")
        } catch (e) {
            setErr(e?.message || "No se pudo guardar la información adicional.")
        } finally {
            setSavingProfile(false)
        }
    }

    return (
        <div className="max-w-2xl space-y-6">
            <div>
                <h2 className="text-xl font-semibold text-emerald-800">Configuración</h2>
                <p className="text-sm text-gray-600">
                    Actualiza tus datos básicos y tu información adicional. Todos los horarios se muestran en
                    la zona horaria de Guayaquil.
                </p>
            </div>

            {/* banners */}
            {loading && (
                <div className="text-sm text-gray-500">Cargando tu información…</div>
            )}
            {!loading && err && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2 text-sm">
                    {err}
                </div>
            )}
            {!loading && ok && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">
                    {ok}
                </div>
            )}

            {/* Datos básicos (usuario) */}
            {!loading && (
                <form
                    onSubmit={saveUser}
                    className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm space-y-4"
                >
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-emerald-800">Datos básicos</h3>
                        <div className="text-xs text-gray-500">
                            Registrado: <span className="font-medium">{toLocalYMD(createdAt)}</span>
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm text-gray-600">Nombre</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="mt-1 w-full rounded-lg border px-3 py-2"
                                placeholder="Tu nombre"
                            />
                        </div>

                        <div>
                            <label className="text-sm text-gray-600">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="mt-1 w-full rounded-lg border px-3 py-2"
                                placeholder="tu@email.com"
                            />
                        </div>

                        <div>
                            <label className="text-sm text-gray-600">Región</label>
                            <select
                                value={region || ""}
                                onChange={(e) => setRegion(e.target.value)}
                                className="mt-1 w-full rounded-lg border px-3 py-2 bg-white"
                            >
                                <option value="">Seleccionar…</option>
                                {REGIONS.map((r) => (
                                    <option key={r.value} value={r.value}>
                                        {r.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={savingUser}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-60"
                        >
                            {savingUser ? "Guardando…" : "Guardar cambios"}
                        </button>
                    </div>
                </form>
            )}

            {/* Información adicional (perfil) */}
            {!loading && (
                <form
                    onSubmit={saveProfile}
                    className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm space-y-4"
                >
                    <h3 className="font-semibold text-blue-800">Información adicional</h3>

                    <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm text-gray-600">Residencia</label>
                            <input
                                type="text"
                                value={residence}
                                onChange={(e) => setResidence(e.target.value)}
                                className="mt-1 w-full rounded-lg border px-3 py-2"
                                placeholder="Ciudad / País"
                            />
                        </div>

                        <div>
                            <label className="text-sm text-gray-600">WhatsApp</label>
                            <input
                                type="text"
                                value={whatsapp}
                                onChange={(e) => setWhatsapp(e.target.value)}
                                className="mt-1 w-full rounded-lg border px-3 py-2"
                                placeholder="Ej: 5939xxxxxxxx"
                            />
                        </div>

                        <div className="sm:col-span-2">
                            <label className="text-sm text-gray-600">Contacto de emergencia</label>
                            <input
                                type="text"
                                value={emergency}
                                onChange={(e) => setEmergency(e.target.value)}
                                className="mt-1 w-full rounded-lg border px-3 py-2"
                                placeholder="Nombre y teléfono"
                            />
                        </div>

                        <div className="sm:col-span-2">
                            <label className="text-sm text-gray-600">Motivo / Razón</label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                rows={3}
                                className="mt-1 w-full rounded-lg border px-3 py-2"
                                placeholder="¿Cuál es el motivo de tu consulta?"
                            />
                        </div>
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={savingProfile}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 text-white font-semibold hover:bg-blue-800 disabled:opacity-60"
                        >
                            {savingProfile ? "Guardando…" : "Guardar información"}
                        </button>
                    </div>
                </form>
            )}
        </div>
    )
}
