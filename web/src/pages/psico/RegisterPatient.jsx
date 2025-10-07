import React from "react"
import { Save } from "lucide-react"
import { useNavigate } from "react-router-dom"

export default function RegisterPatient() {
    const navigate = useNavigate()
    const [form, setForm] = React.useState({
        nombre: "", apellido: "", nacimiento: "",
        residencia: "", email: "", emergencia: "",
        whatsapp: "", motivo: "",
    })

    const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

    const onSubmit = (e) => {
        e.preventDefault()
        // Validaciones simples
        if (!form.nombre || !form.apellido || !form.email) {
            alert("Nombre, Apellido y Email son obligatorios.")
            return
        }
        // Aquí llamas al backend: POST /patients
        alert("(Demo) Paciente registrado.")
        navigate("/psico/pacientes")
    }

    return (
        <div className="max-w-3xl mx-auto rounded-2xl bg-white p-6 border shadow-sm">
            <h1 className="text-2xl font-bold text-emerald-800">Registrar paciente</h1>
            <p className="text-gray-600 text-sm">Completa los datos básicos. Podrás añadir historia clínica y plan después.</p>

            <form onSubmit={onSubmit} className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium">Nombre</label>
                    <input name="nombre" value={form.nombre} onChange={onChange} className="mt-1 w-full rounded-lg border-gray-300" />
                </div>
                <div>
                    <label className="block text-sm font-medium">Apellido</label>
                    <input name="apellido" value={form.apellido} onChange={onChange} className="mt-1 w-full rounded-lg border-gray-300" />
                </div>
                <div>
                    <label className="block text-sm font-medium">Fecha de nacimiento</label>
                    <input type="date" name="nacimiento" value={form.nacimiento} onChange={onChange} className="mt-1 w-full rounded-lg border-gray-300" />
                </div>
                <div>
                    <label className="block text-sm font-medium">Lugar de residencia</label>
                    <input name="residencia" value={form.residencia} onChange={onChange} className="mt-1 w-full rounded-lg border-gray-300" />
                </div>
                <div>
                    <label className="block text-sm font-medium">E-mail</label>
                    <input type="email" name="email" value={form.email} onChange={onChange} className="mt-1 w-full rounded-lg border-gray-300" />
                </div>
                <div>
                    <label className="block text-sm font-medium">Contacto de emergencia</label>
                    <input name="emergencia" value={form.emergencia} onChange={onChange} className="mt-1 w-full rounded-lg border-gray-300" placeholder="Nombre y teléfono" />
                </div>
                <div>
                    <label className="block text-sm font-medium">Número de WhatsApp</label>
                    <input name="whatsapp" value={form.whatsapp} onChange={onChange} className="mt-1 w-full rounded-lg border-gray-300" placeholder="+593 ..." />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium">Motivo de consulta</label>
                    <textarea name="motivo" value={form.motivo} onChange={onChange} rows={4} className="mt-1 w-full rounded-lg border-gray-300" />
                </div>

                <div className="md:col-span-2 flex justify-end gap-3 mt-2">
                    <button type="button" onClick={() => navigate(-1)} className="px-4 py-2 rounded-lg border hover:bg-gray-50">Cancelar</button>
                    <button type="submit" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700">
                        <Save className="h-4 w-4" /> Guardar
                    </button>
                </div>
            </form>
        </div>
    )
}
