import React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { Save, Pencil, X } from "lucide-react"
import { apiGet, apiPost, apiPut } from "../../lib/api"

function fieldClass(disabled) {
    return [
        "mt-1 w-full rounded-lg",
        disabled
            ? "border-slate-200 bg-slate-50 text-slate-600"
            : "border-emerald-300 focus:ring-emerald-600 focus:border-emerald-600",
        "border",
    ].join(" ")
}

export default function TherapeuticPlan() {
    const { id } = useParams() // patient_id
    const navigate = useNavigate()

    const emptyForm = {
        objetivos: "",
        frecuencia: "Semanal",
        tecnicas: "",
        tareas: "",
        metricas: "",
        proximaRevision: "", // yyyy-mm-dd
        notas: "",
    }

    const [patient, setPatient] = React.useState(null)
    const [plan, setPlan] = React.useState(null) // objeto del backend si existe
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

    React.useEffect(() => {
        let alive = true
        async function load() {
            setLoading(true)
            setErrorMsg("")
            setOkMsg("")
            try {
                const p = await apiGet(`/users/${id}`)
                if (!alive) return
                setPatient(p)

                // Traemos el primer plan (si existe) por patient_id
                const list = await apiGet(`/therapeutic_plans?patient_id=${id}&skip=0&limit=1`)
                if (!alive) return
                const exists = Array.isArray(list) && list.length > 0 ? list[0] : null
                setPlan(exists)

                if (exists) {
                    const filled = {
                        objetivos: exists.objetivos ?? "",
                        frecuencia: exists.frecuencia ?? "Semanal",
                        tecnicas: exists.intervenciones ?? exists.tecnicas ?? "", // por si el schema usa "intervenciones"
                        tareas: exists.tareas ?? "",
                        metricas: exists.metricas ?? "",
                        proximaRevision: exists.proxima_revision
                            ? exists.proxima_revision.slice(0, 10)
                            : "",
                        notas: exists.notas ?? "",
                    }
                    setForm(filled)
                    setInitialForm(filled)
                    setIsEditing(false) // lectura si ya existe
                } else {
                    setForm(emptyForm)
                    setInitialForm(emptyForm)
                    setIsEditing(true) // edición si no existe
                }
            } catch (err) {
                if (!alive) return
                setErrorMsg(err.message || "No se pudo cargar el plan terapéutico.")
            } finally {
                if (!alive) return
                setLoading(false)
            }
        }
        load()
        return () => {
            alive = false
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id])

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

        // payload en snake_case (alineado al backend)
        const payload = {
            patient_id: Number(id),
            objetivos: form.objetivos || null,
            frecuencia: form.frecuencia || null,
            intervenciones: form.tecnicas || null,   // backend suele llamarlo 'intervenciones'
            tareas: form.tareas || null,
            metricas: form.metricas || null,
            proxima_revision: form.proximaRevision || null, // yyyy-mm-dd
            notas: form.notas || null,
        }

        try {
            let saved
            if (plan?.id) {
                saved = await apiPut(`/therapeutic_plans/${plan.id}`, payload)
            } else {
                saved = await apiPost(`/therapeutic_plans`, payload)
            }

            // refrescar estados
            setPlan(saved)
            const canonical = {
                objetivos: saved.objetivos ?? "",
                frecuencia: saved.frecuencia ?? "Semanal",
                tecnicas: saved.intervenciones ?? saved.tecnicas ?? "",
                tareas: saved.tareas ?? "",
                metricas: saved.metricas ?? "",
                proximaRevision: saved.proxima_revision ? saved.proxima_revision.slice(0, 10) : "",
                notas: saved.notas ?? "",
            }
            setForm(canonical)
            setInitialForm(canonical)
            setIsEditing(false)
            setOkMsg("Plan terapéutico guardado correctamente.")
        } catch (err) {
            setErrorMsg(err.message || "No se pudo guardar el plan terapéutico.")
        }
    }

    const titleName = patient?.name || `Paciente #${id}`

    return (
        <div className="max-w-4xl mx-auto rounded-2xl bg-white p-6 border shadow-sm">
            <div className="flex items-baseline justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-emerald-800">{titleName}</h1>
                    <p className="text-gray-600 text-sm">Plan terapéutico</p>
                </div>

                <div className="flex items-center gap-2">
                    {plan?.updated_at && (
                        <div className="text-xs text-gray-500 mr-2">
                            Última actualización: {new Date(plan.updated_at).toLocaleString()}
                        </div>
                    )}
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
            </div>

            {loading && <div className="mt-4 text-sm text-gray-500">Cargando datos…</div>}
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
                <form onSubmit={onSubmit} className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium">Objetivos terapéuticos</label>
                        <textarea
                            name="objetivos"
                            value={form.objetivos}
                            onChange={onChange}
                            rows={3}
                            disabled={!isEditing}
                            className={fieldClass(!isEditing)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium">Frecuencia</label>
                        <select
                            name="frecuencia"
                            value={form.frecuencia}
                            onChange={onChange}
                            disabled={!isEditing}
                            className={fieldClass(!isEditing)}
                        >
                            {["Semanal", "Quincenal", "Mensual", "Otra"].map((opt) => (
                                <option key={opt} value={opt}>
                                    {opt}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium">Próxima revisión</label>
                        <input
                            type="date"
                            name="proximaRevision"
                            value={form.proximaRevision}
                            onChange={onChange}
                            disabled={!isEditing}
                            className={fieldClass(!isEditing)}
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium">Técnicas / Intervenciones</label>
                        <textarea
                            name="tecnicas"
                            value={form.tecnicas}
                            onChange={onChange}
                            rows={3}
                            disabled={!isEditing}
                            className={fieldClass(!isEditing)}
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium">Tareas para casa</label>
                        <textarea
                            name="tareas"
                            value={form.tareas}
                            onChange={onChange}
                            rows={3}
                            disabled={!isEditing}
                            className={fieldClass(!isEditing)}
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium">Métricas / Escalas</label>
                        <textarea
                            name="metricas"
                            value={form.metricas}
                            onChange={onChange}
                            rows={3}
                            disabled={!isEditing}
                            className={fieldClass(!isEditing)}
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium">Notas</label>
                        <textarea
                            name="notas"
                            value={form.notas}
                            onChange={onChange}
                            rows={3}
                            disabled={!isEditing}
                            className={fieldClass(!isEditing)}
                        />
                    </div>

                    <div className="md:col-span-2 flex justify-end gap-3 mt-2">
                        <button
                            type="button"
                            onClick={() => navigate(-1)}
                            className="px-4 py-2 rounded-lg border hover:bg-gray-50"
                        >
                            Volver
                        </button>
                        <button
                            type="submit"
                            disabled={!isEditing || !isDirty}
                            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-white transition
                ${!isEditing || !isDirty
                                    ? "bg-slate-300 cursor-not-allowed"
                                    : "bg-emerald-600 hover:bg-emerald-700"
                                }`}
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
