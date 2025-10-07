// src/pages/patient/Profile.jsx
import React from "react"
import { Save, Pencil, X } from "lucide-react"
import { apiGet, apiPost, apiPut } from "../../lib/api"
import { getUserFromToken } from "../../lib/auth"
import { useNavigate } from "react-router-dom"

function fieldClass(disabled) {
    return [
        "mt-1 w-full rounded-lg",
        disabled
            ? "border-slate-200 bg-slate-50 text-slate-600"
            : "border-emerald-300 focus:ring-emerald-600 focus:border-emerald-600",
        "border",
    ].join(" ")
}

export default function Profile() {
    const navigate = useNavigate()
    const user = getUserFromToken()
    const emptyForm = {
        residence: "",
        emergency_contact: "",
        whatsapp: "",
        reason: "",
    }

    const [profile, setProfile] = React.useState(null)
    const [form, setForm] = React.useState(emptyForm)
    const [initialForm, setInitialForm] = React.useState(emptyForm)
    const [loading, setLoading] = React.useState(true)
    const [errorMsg, setErrorMsg] = React.useState("")
    const [okMsg, setOkMsg] = React.useState("")
    const [isEditing, setIsEditing] = React.useState(false)

    const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

    const isDirty = React.useMemo(
        () => Object.keys(form).some((k) => (form[k] || "") !== (initialForm[k] || "")),
        [form, initialForm]
    )

    function is404Error(err) {
        const s =
            err?.status ??
            err?.code ??
            err?.response?.status ??
            (typeof err?.message === "string" ? err.message : "") ??
            ""
        if (typeof s === "number") return s === 404
        return /404|not\s*found|perfil\s*no\s*encontrado/i.test(String(s))
    }

    async function fetchProfile() {
        setLoading(true)
        setErrorMsg("")
        setOkMsg("")
        try {
            const res = await apiGet(`/patients/me?_=${Date.now()}`)
            setProfile(res)
            const filled = {
                residence: res.residence ?? "",
                emergency_contact: res.emergency_contact ?? "",
                whatsapp: res.whatsapp ?? "",
                reason: res.reason ?? "",
            }
            setForm(filled)
            setInitialForm(filled)
            setIsEditing(false) // modo lectura si ya existe
        } catch (err) {
            // Si no hay perfil (404), NO mostramos error ni “perfil no encontrado”
            if (is404Error(err)) {
                setProfile(null)
                setForm(emptyForm)
                setInitialForm(emptyForm)
                setIsEditing(true) // entra directo a edición
                setErrorMsg("")    // sin mensaje
            } else {
                setErrorMsg(err?.message || "No se pudo cargar el perfil.")
            }
        } finally {
            setLoading(false)
        }
    }

    React.useEffect(() => {
        if (user?.id) fetchProfile()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id])

    function handleEdit() {
        setIsEditing(true)
        setOkMsg("")
    }

    function handleCancel() {
        setForm(initialForm)
        setIsEditing(false)
        setOkMsg("")
        setErrorMsg("")
    }

    async function onSubmit(e) {
        e.preventDefault()
        if (!isEditing) return
        setErrorMsg("")
        setOkMsg("")

        const payload = {
            residence: form.residence || null,
            emergency_contact: form.emergency_contact || null,
            whatsapp: form.whatsapp || null,
            reason: form.reason || null,
        }

        try {
            if (profile?.user_id) {
                await apiPut("/patients/me", payload)
            } else {
                await apiPost("/patients/me", payload)
            }

            // re-cargar para sincronizar estado local
            await fetchProfile()
            setOkMsg("Perfil guardado correctamente.")

            // avisar al layout que el perfil cambió
            window.dispatchEvent(new Event("profile-updated"))

            // ir directo a Mis Citas
            navigate("/paciente/citas", { replace: true })
        } catch (err) {
            setErrorMsg(err.message || "No se pudo guardar el perfil.")
        }
    }

    const title = user?.name || user?.email || "Paciente"

    return (
        <div className="max-w-3xl mx-auto rounded-2xl bg-white p-6 border shadow-sm">
            <div className="flex items-baseline justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-emerald-800">Mi perfil</h1>
                    <p className="text-gray-600 text-sm">{title}</p>
                </div>
                {!loading && (
                    <>
                        {!isEditing ? (
                            <button
                                type="button"
                                onClick={handleEdit}
                                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                            >
                                <Pencil className="h-4 w-4" />
                                Editar
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                            >
                                <X className="h-4 w-4" />
                                Cancelar
                            </button>
                        )}
                    </>
                )}
            </div>

            {loading && <div className="mt-4 text-sm text-gray-500">Cargando…</div>}
            {errorMsg && !loading && (
                <div className="mt-4 text-sm rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2">
                    {errorMsg}
                </div>
            )}
            {okMsg && !loading && (
                <div className="mt-4 text-sm rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 px-3 py-2">
                    {okMsg}
                </div>
            )}

            {!loading && (
                <form onSubmit={onSubmit} className="mt-6 grid grid-cols-1 gap-4">
                    <div>
                        <label className="block text-sm font-medium">Residencia</label>
                        <input
                            type="text"
                            name="residence"
                            value={form.residence}
                            onChange={onChange}
                            disabled={!isEditing}
                            className={fieldClass(!isEditing)}
                            placeholder="Ciudad / País"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium">WhatsApp</label>
                        <input
                            type="tel"
                            name="whatsapp"
                            value={form.whatsapp}
                            onChange={onChange}
                            disabled={!isEditing}
                            className={fieldClass(!isEditing)}
                            placeholder="+593 9xxxxxxx"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium">Contacto de emergencia</label>
                        <input
                            type="text"
                            name="emergency_contact"
                            value={form.emergency_contact}
                            onChange={onChange}
                            disabled={!isEditing}
                            className={fieldClass(!isEditing)}
                            placeholder="Nombre y teléfono"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium">Motivo de consulta</label>
                        <textarea
                            name="reason"
                            value={form.reason}
                            onChange={onChange}
                            disabled={!isEditing}
                            rows={3}
                            className={fieldClass(!isEditing)}
                            placeholder="¿Qué te gustaría trabajar en terapia?"
                        />
                    </div>

                    <div className="flex justify-end gap-3 mt-2">
                        <button
                            type="submit"
                            disabled={!isEditing || !isDirty}
                            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-white transition
                ${!isEditing || !isDirty ? "bg-slate-300 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"}`}
                        >
                            <Save className="h-4 w-4" />
                            Guardar
                        </button>
                    </div>
                </form>
            )}
        </div>
    )
}
