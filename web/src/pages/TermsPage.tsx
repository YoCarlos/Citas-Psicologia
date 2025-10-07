import React from "react"
import {
    FileText,
    ShieldCheck,
    CreditCard,
    CalendarClock,
    RefreshCcw,
    AlertTriangle,
    Video,
    UserCheck,
    Lock,
    Globe,
    Mail,
    Scale,
} from "lucide-react"
import { Link } from "react-router-dom"

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b">
                <div className="max-w-5xl mx-auto px-4 py-8">
                    <div className="text-sm text-gray-500">
                        <Link to="/" className="hover:underline">Inicio</Link> <span>·</span> Términos y Condiciones
                    </div>
                    <h1 className="mt-2 text-3xl font-bold text-emerald-800 flex items-center gap-3">
                        <FileText className="h-8 w-8" />
                        Términos y Condiciones de Uso
                    </h1>
                    <p className="mt-2 text-gray-600 max-w-2xl">
                        Estos Términos regulan el uso de <strong>CitasPsico</strong> (la “Plataforma”) y los servicios de la
                        profesional tratante (la “Psicóloga”). Al crear una cuenta o reservar una cita, aceptas estos Términos.
                    </p>
                    <p className="mt-1 text-xs text-gray-500">Última actualización: 9 de septiembre de 2025</p>
                </div>
            </header>

            {/* Body */}
            <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">

                {/* 1. Partes */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-emerald-800 flex items-center gap-2"><UserCheck className="h-5 w-5" /> 1. Partes y alcance</h2>
                    <p className="mt-3 text-gray-700">
                        La relación terapéutica se establece entre tú (el “Paciente” o “Usuario”) y la Psicóloga. La Plataforma
                        provee herramientas tecnológicas de agendamiento, videollamadas y pagos. Algunas funciones pueden ser
                        prestadas por terceros (Stripe, Zoom, hosting, mensajería).
                    </p>
                </section>

                {/* 2. Cuenta y uso aceptable */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-emerald-800 flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> 2. Cuenta, veracidad y uso aceptable</h2>
                    <ul className="mt-3 list-disc pl-5 text-gray-700 space-y-1">
                        <li>Debes proporcionar datos veraces y mantener la confidencialidad de tus credenciales.</li>
                        <li>Está prohibido el uso fraudulento, abusivo o que vulnere derechos de terceros o la ley.</li>
                        <li>La atención a <strong>menores de edad</strong> requiere consentimiento de representantes legales.</li>
                    </ul>
                </section>

                {/* 3. Agendamiento, duración y puntualidad */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-emerald-800 flex items-center gap-2"><CalendarClock className="h-5 w-5" /> 3. Agendamiento, duración y puntualidad</h2>
                    <ul className="mt-3 list-disc pl-5 text-gray-700 space-y-1">
                        <li>Las citas se agendan en los horarios disponibles definidos por la Psicóloga.</li>
                        <li>La <strong>duración</strong> de la sesión es la que configure la Psicóloga (p. ej., 50 min).</li>
                        <li>Se recomienda conectarse con 5 minutos de anticipación; la tardanza puede afectar el tiempo efectivo.</li>
                    </ul>
                </section>

                {/* 4. Pagos: Stripe y transferencia */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-emerald-800 flex items-center gap-2"><CreditCard className="h-5 w-5" /> 4. Pagos y confirmaciones</h2>
                    <ul className="mt-3 list-disc pl-5 text-gray-700 space-y-2">
                        <li><strong>Stripe:</strong> el pago se procesa de forma segura. La cita queda <em>confirmada</em> al éxito del pago.</li>
                        <li><strong>Transferencia bancaria:</strong> al reportarse el pago, la cita quedará <em>pendiente</em>. Una vez que la Psicóloga marque “recibido”, dispone de <strong>hasta 3 horas</strong> para confirmar; si no confirma en ese plazo, el horario puede liberarse.</li>
                        <li>Los precios se muestran en USD (u otra moneda si así se indica). Pueden existir impuestos o cargos de terceros.</li>
                    </ul>
                </section>

                {/* 5. Reagendación y cancelación (≥ 4h) */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-emerald-800 flex items-center gap-2"><RefreshCcw className="h-5 w-5" /> 5. Reagendación y cancelación</h2>
                    <ul className="mt-3 list-disc pl-5 text-gray-700 space-y-2">
                        <li>El Usuario puede <strong>cancelar o reagendar</strong> sin penalidad hasta <strong>4 horas</strong> antes de la hora agendada.</li>
                        <li>Dentro de las 4 horas previas, la cancelación puede no ser reembolsable (criterio de la Psicóloga y/o política publicada en el perfil).</li>
                        <li>Si la Psicóloga necesitara reprogramar por causa justificada, se ofrecerá nueva fecha/horario sin costo adicional.</li>
                    </ul>
                </section>

                {/* 6. Sesiones virtuales (Zoom) */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-emerald-800 flex items-center gap-2"><Video className="h-5 w-5" /> 6. Sesiones virtuales</h2>
                    <ul className="mt-3 list-disc pl-5 text-gray-700 space-y-2">
                        <li>Las videollamadas pueden realizarse mediante <strong>Zoom</strong> u otro servicio integrado.</li>
                        <li>El Usuario es responsable de contar con Internet estable, dispositivo y espacio privado.</li>
                        <li>Salvo acuerdo explícito, <strong>no se permite grabar</strong> sesiones.</li>
                    </ul>
                </section>

                {/* 7. Confidencialidad, riesgo crítico y autoridades */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-emerald-800 flex items-center gap-2"><Lock className="h-5 w-5" /> 7. Confidencialidad y escalamiento</h2>
                    <p className="mt-3 text-gray-700">
                        La Psicóloga mantiene el secreto profesional y el manejo confidencial de la información clínica. En
                        <strong> situaciones de riesgo inminente</strong> para la vida o integridad del Usuario o de terceros (p. ej.,
                        ideación/intentona suicida, violencia o amenaza grave), la Psicóloga podrá, según criterio profesional y
                        normativa aplicable, <strong>contactar servicios de emergencia y/o informar a autoridades competentes</strong>,
                        limitando la comunicación a la <em>mínima información necesaria</em>.
                    </p>
                    <p className="mt-2 text-sm text-gray-600">
                        El resto de supuestos de tratamiento de datos personales se rigen por la <Link to="/privacy" className="text-emerald-700 hover:underline">Política de Privacidad</Link>.
                    </p>
                </section>

                {/* 8. Limitación de responsabilidad */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-emerald-800 flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> 8. Limitaciones de responsabilidad</h2>
                    <ul className="mt-3 list-disc pl-5 text-gray-700 space-y-2">
                        <li>La Plataforma se ofrece “tal cual” y “según disponibilidad”. Pueden existir interrupciones por mantenimiento, fallas de terceros o fuerza mayor.</li>
                        <li>La atención psicológica no sustituye atención médica de emergencia. En urgencias, llama a servicios locales de emergencia.</li>
                        <li>En la medida máxima permitida por la ley, la responsabilidad de la Plataforma por daños directos se limita a los valores efectivamente pagados por el Usuario por el servicio tecnológico en el mes previo al evento.</li>
                    </ul>
                </section>

                {/* 9. Propiedad intelectual y uso de contenido */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-emerald-800 flex items-center gap-2"><Lock className="h-5 w-5" /> 9. Propiedad intelectual</h2>
                    <p className="mt-3 text-gray-700">
                        Las marcas, interfaz, software y contenidos de la Plataforma son de sus respectivos titulares. No se
                        concede licencia alguna salvo lo necesario para usar el servicio conforme a estos Términos.
                    </p>
                </section>

                {/* 10. Jurisdicción y ley aplicable */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-emerald-800 flex items-center gap-2"><Scale className="h-5 w-5" /> 10. Jurisdicción y ley aplicable</h2>
                    <p className="mt-3 text-gray-700">
                        Salvo disposición imperativa distinta, estos Términos se interpretan conforme a las leyes del país donde
                        la Psicóloga presta servicios (p. ej., Ecuador) y los tribunales competentes del mismo. Si eres consumidor,
                        podrás disponer de los fueros que te correspondan según tu normativa local.
                    </p>
                </section>

                {/* 11. Cambios, contacto y disposiciones finales */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-emerald-800 flex items-center gap-2"><Globe className="h-5 w-5" /> 11. Cambios y contacto</h2>
                    <ul className="mt-3 list-disc pl-5 text-gray-700 space-y-2">
                        <li>Podemos actualizar estos Términos para reflejar cambios legales u operativos. La versión vigente se publicará en esta página.</li>
                        <li className="flex items-start gap-2">
                            <Mail className="h-5 w-5 mt-0.5 flex-shrink-0 text-gray-500" />
                            Contacto: <a className="text-emerald-700 hover:underline" href="mailto:soporte@citaspsico.com">soporte@citaspsico.com</a>
                        </li>
                    </ul>
                    <p className="mt-3 text-xs text-gray-500">
                        Este documento es informativo y no constituye asesoría legal. Recomendamos su revisión por asesoría jurídica local.
                    </p>
                </section>

            </main>
        </div>
    )
}

