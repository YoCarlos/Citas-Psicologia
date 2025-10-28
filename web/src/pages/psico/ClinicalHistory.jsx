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

export default function ClinicalHistory() {
    const { id } = useParams() // id del paciente
    const navigate = useNavigate()

    const [patient, setPatient] = React.useState(null)
    const [history, setHistory] = React.useState(null) // objeto completo recibido del backend (si existe)
    const [loading, setLoading] = React.useState(true)
    const [errorMsg, setErrorMsg] = React.useState("")
    const [okMsg, setOkMsg] = React.useState("")

    // Edición / lectura
    const [isEditing, setIsEditing] = React.useState(false)

    // === FORM ===
    const emptyForm = {
        antecedentesPersonales: "",
        antecedentesFamiliares: "",
        medicacionActual: "",
        alergias: "",
        diagnosticosPrevios: "",
        consumo: "",
        antecedentesPsico: "",
        factoresProtectores: "",     // ✅ nuevo campo en el form
        notas: "",
    }

    const [form, setForm] = React.useState(emptyForm)
    const [initialForm, setInitialForm] = React.useState(emptyForm)

    const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

    // Detectar si hay cambios
    const isDirty = React.useMemo(
        () => Object.keys(form).some((k) => (form[k] || "") !== (initialForm[k] || "")),
        [form, initialForm]
    )

    // Cargar paciente + historia clínica (si existe)
    React.useEffect(() => {
        let alive = true
        async function load() {
            setLoading(true)
            setErrorMsg("")
            setOkMsg("")
            try {
                // 1) Datos del paciente
                const p = await apiGet(`/users/${id}`)
                if (!alive) return
                setPatient(p)

                // 2) Historia clínica (por patient_id, tomamos la primera si existe)
                const list = await apiGet(`/clinical_histories?patient_id=${id}&skip=0&limit=1`)
                if (!alive) return

                const exists = Array.isArray(list) && list.length > 0 ? list[0] : null
                setHistory(exists)

                if (exists) {
                    const filled = {
                        antecedentesPersonales: exists.antecedentes_personales ?? "",
                        antecedentesFamiliares: exists.antecedentes_familiares ?? "",
                        medicacionActual: exists.medicacion_actual ?? "",
                        alergias: exists.alergias ?? "",
                        diagnosticosPrevios: exists.diagnosticos_previos ?? "",
                        consumo: exists.consumo ?? "",
                        antecedentesPsico: exists.antecedentes_psico ?? "",
                        factoresProtectores: exists.factores_protectores ?? "", // ✅ cargar del backend
                        notas: exists.notas ?? "",
                    }
                    setForm(filled)
                    setInitialForm(filled)
                    setIsEditing(false) // si hay historia, inicia en lectura
                } else {
                    setForm(emptyForm)
                    setInitialForm(emptyForm)
                    setIsEditing(true) // si no hay, inicia en edición
                }
            } catch (err) {
                if (!alive) return
                setErrorMsg(err.message || "No se pudo cargar la historia clínica.")
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
        setForm(initialForm) // revierte cambios
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
            patient_id: Number(id),
            antecedentes_personales: form.antecedentesPersonales || null,
            antecedentes_familiares: form.antecedentesFamiliares || null,
            medicacion_actual: form.medicacionActual || null,
            alergias: form.alergias || null,
            diagnosticos_previos: form.diagnosticosPrevios || null,
            consumo: form.consumo || null,
            antecedentes_psico: form.antecedentesPsico || null,
            factores_protectores: form.factoresProtectores || null, // ✅ enviar al backend
            notas: form.notas || null,
        }

        try {
            let saved
            if (history?.id) {
                saved = await apiPut(`/clinical_histories/${history.id}`, payload)
            } else {
                saved = await apiPost(`/clinical_histories`, payload)
            }

            // Refresca estados con lo que devuelve el backend
            setHistory(saved)
            const canonical = {
                antecedentesPersonales: saved.antecedentes_personales ?? "",
                antecedentesFamiliares: saved.antecedentes_familiares ?? "",
                medicacionActual: saved.medicacion_actual ?? "",
                alergias: saved.alergias ?? "",
                diagnosticosPrevios: saved.diagnosticos_previos ?? "",
                consumo: saved.consumo ?? "",
                antecedentesPsico: saved.antecedentes_psico ?? "",
                factoresProtectores: saved.factores_protectores ?? "", // ✅ refrescar del backend
                notas: saved.notas ?? "",
            }
            setForm(canonical)
            setInitialForm(canonical)
            setIsEditing(false)
            setOkMsg("Historia clínica guardada correctamente.")
        } catch (err) {
            setErrorMsg(err.message || "No se pudo guardar la historia clínica.")
        }
    }

    const titleName = patient?.name || `Paciente #${id}`

    return (
        <div className="max-w-4xl mx-auto rounded-2xl bg-white p-6 border shadow-sm">
            <div className="flex items-baseline justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-emerald-800">{titleName}</h1>
                    <p className="text-gray-600 text-sm">Historia clínica</p>
                </div>

                <div className="flex items-center gap-2">
                    {history?.updated_at && (
                        <div className="text-xs text-gray-500 mr-2">
                            Última actualización: {new Date(history.updated_at).toLocaleString()}
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

            {loading && (
                <div className="mt-4 text-sm text-gray-500">Cargando datos…</div>
            )}
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
                    {[
                        ["antecedentesPersonales", "Antecedentes personales"],
                        ["antecedentesFamiliares", "Antecedentes familiares"],
                        ["medicacionActual", "Medicación actual"],
                        ["alergias", "Alergias"],
                        ["diagnosticosPrevios", "Diagnósticos previos"],
                        ["consumo", "Consumo (tabaco, alcohol, otras)"],
                        ["antecedentesPsico", "Antecedentes psicológicos/psiquiátricos"],
                        ["factoresProtectores", "Factores protectores"], // ✅ nuevo textarea visible
                        ["notas", "Notas adicionales"],
                    ].map(([name, label]) => (
                        <div key={name}>
                            <label className="block text-sm font-medium">{label}</label>
                            <textarea
                                name={name}
                                value={form[name]}
                                onChange={onChange}
                                rows={3}
                                disabled={!isEditing}
                                className={fieldClass(!isEditing)}
                            />
                        </div>
                    ))}

                    <div className="flex justify-end gap-3 mt-2">
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
