import React from "react"
import {
    ShieldCheck,
    Lock,
    User,
    FileText,
    AlertTriangle,
    Globe,
    Database,
    Clock4,
    Mail,
    Link as LinkIcon,
} from "lucide-react"
import { Link } from "react-router-dom"

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-gray-50">
            {/* Encabezado */}
            <header className="bg-white border-b">
                <div className="max-w-5xl mx-auto px-4 py-8">
                    <div className="text-sm text-gray-500">
                        <Link to="/" className="hover:underline">Inicio</Link> <span>·</span> Política de Privacidad
                    </div>
                    <h1 className="mt-2 text-3xl font-bold text-emerald-800 flex items-center gap-3">
                        <ShieldCheck className="h-8 w-8" />
                        Política de Privacidad
                    </h1>
                    <p className="mt-2 text-gray-600 max-w-2xl">
                        Esta política describe cómo <strong>CitasPsico</strong> (la “Plataforma”) y la profesional tratante
                        (la “Psicóloga”) recolectan, usan y protegen tus datos personales cuando utilizas nuestros servicios de
                        agendamiento y atención psicológica en línea.
                    </p>
                    <p className="mt-1 text-xs text-gray-500">Última actualización: 9 de septiembre de 2025</p>
                </div>
            </header>

            {/* Contenido */}
            <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
                {/* Identidad y contacto */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-emerald-800 flex items-center gap-2">
                        <User className="h-5 w-5" /> Responsables e identificación
                    </h2>
                    <div className="mt-3 text-gray-700 space-y-2">
                        <p>
                            <strong>Responsable del tratamiento:</strong> la Psicóloga que presta el servicio a través de la
                            Plataforma, con quien mantienes la relación terapéutica.
                        </p>
                        <p>
                            <strong>Encargado/Proveedor tecnológico:</strong> <em>CitasPsico</em>, que provee la infraestructura
                            para el agendamiento, videollamadas y gestión de pagos.
                        </p>
                        <p className="text-sm text-gray-600 flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            Contacto de privacidad: <a className="text-emerald-700 hover:underline" href="mailto:soporte@citaspsico.com">soporte@citaspsico.com</a>
                        </p>
                    </div>
                </section>

                {/* Datos que recolectamos */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-emerald-800 flex items-center gap-2">
                        <Database className="h-5 w-5" /> Datos que recolectamos
                    </h2>
                    <div className="mt-3 text-gray-700">
                        <ul className="list-disc pl-5 space-y-1">
                            <li><strong>Identificación y contacto:</strong> nombre, apellido, correo electrónico, número de WhatsApp, residencia y contacto de emergencia.</li>
                            <li><strong>Agenda y uso del servicio:</strong> citas programadas, reprogramaciones, cancelaciones, método de pago, estado de pago.</li>
                            <li><strong>Información clínica voluntaria:</strong> motivo de consulta, historia clínica y plan terapéutico aportados por ti o registrados por la Psicóloga durante el proceso de atención.</li>
                            <li><strong>Datos técnicos:</strong> dirección IP, tipo de dispositivo/navegador, registros de acceso para fines de seguridad y diagnóstico.</li>
                        </ul>
                        <p className="mt-3 text-sm text-gray-600">
                            Solo pedimos datos pertinentes y proporcionales a la finalidad terapéutica y de prestación del servicio.
                        </p>
                    </div>
                </section>

                {/* Finalidades y base legal */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-emerald-800 flex items-center gap-2">
                        <FileText className="h-5 w-5" /> Finalidades y bases legales
                    </h2>
                    <div className="mt-3 text-gray-700 space-y-2">
                        <p>Usamos tus datos para:</p>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>Gestionar tu cuenta, agenda y recordatorios de citas.</li>
                            <li>Brindar atención psicológica (historia clínica, plan terapéutico, seguimiento).</li>
                            <li>Procesar pagos y facturación.</li>
                            <li>Mejorar la seguridad, calidad y disponibilidad de la Plataforma.</li>
                            <li>Dar cumplimiento a obligaciones legales y autoridad competente cuando aplique.</li>
                        </ul>
                        <p className="text-sm text-gray-600">
                            La base legal puede ser: ejecución del contrato/servicio solicitado, consentimiento, interés legítimo en
                            seguridad/mejora del servicio y cumplimiento de obligaciones legales.
                        </p>
                    </div>
                </section>

                {/* Riesgo crítico / autoridades */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-red-700 flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" /> Situaciones de riesgo crítico
                    </h2>
                    <div className="mt-3 text-gray-700 space-y-2">
                        <p>
                            En casos de <strong>riesgo inminente</strong> para tu vida o la de terceros (por ejemplo, ideación o intento
                            suicida, riesgo grave de autolesión, violencia, abuso o amenaza real), la Psicóloga podrá, de forma
                            proporcional, <strong>contactar a los servicios de emergencia y/o informar a las autoridades competentes</strong>,
                            conforme a la legislación aplicable y a su criterio profesional.
                        </p>
                        <p className="text-sm text-gray-600">
                            Esta comunicación se limitará a la <em>mínima información necesaria</em> para salvaguardar la integridad de la
                            persona afectada y de terceros.
                        </p>
                    </div>
                </section>

                {/* Confidencialidad y videollamadas */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-emerald-800 flex items-center gap-2">
                        <Lock className="h-5 w-5" /> Confidencialidad, videollamadas y terceros
                    </h2>
                    <div className="mt-3 text-gray-700 space-y-2">
                        <p>
                            Respetamos el <strong>secreto profesional</strong> y la confidencialidad de la información clínica.
                            Nadie ajeno a tu proceso terapéutico accede a tus notas o historia clínica sin tu autorización,
                            salvo obligación legal o situación de riesgo crítico descrita arriba.
                        </p>
                        <p>
                            Para ciertas funciones utilizamos proveedores externos (“encargados de tratamiento”), por ejemplo:
                        </p>
                        <ul className="list-disc pl-5 space-y-1">
                            <li><strong>Pagos:</strong> Stripe u otros pasarelas para procesar pagos de forma segura.</li>
                            <li><strong>Videollamadas:</strong> Zoom u otro servicio integrado para las sesiones virtuales.</li>
                            <li><strong>Infraestructura:</strong> servicios de hosting, almacenamiento y correo transaccional.</li>
                        </ul>
                        <p className="text-sm text-gray-600">
                            Estos terceros sólo tratan datos según nuestras instrucciones y con salvaguardas contractuales adecuadas.
                            Te recomendamos revisar sus propias políticas de privacidad.
                        </p>
                    </div>
                </section>

                {/* Conservación de datos */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-emerald-800 flex items-center gap-2">
                        <Clock4 className="h-5 w-5" /> Plazos de conservación
                    </h2>
                    <div className="mt-3 text-gray-700 space-y-2">
                        <p>
                            Conservaremos tus datos <strong>mientras dure la relación terapéutica</strong> y, posteriormente,
                            por los plazos necesarios para atender obligaciones legales o defensa ante posibles reclamaciones.
                            Los datos no necesarios serán eliminados o anonimizados de forma segura.
                        </p>
                    </div>
                </section>

                {/* Derechos del titular */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-emerald-800 flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5" /> Tus derechos
                    </h2>
                    <div className="mt-3 text-gray-700">
                        <ul className="list-disc pl-5 space-y-1">
                            <li>Acceso, rectificación y actualización de tus datos.</li>
                            <li>Eliminación y oposición, cuando proceda.</li>
                            <li>Portabilidad de datos, cuando aplique.</li>
                            <li>Revocación del consentimiento, sin efectos retroactivos.</li>
                        </ul>
                        <p className="mt-3 text-sm text-gray-600">
                            Para ejercer tus derechos, escríbenos a <a className="text-emerald-700 hover:underline" href="mailto:soporte@citaspsico.com">soporte@citaspsico.com</a>.
                            Podremos solicitar verificación de identidad antes de atender tu solicitud.
                        </p>
                    </div>
                </section>

                {/* Transferencias internacionales y cookies */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-emerald-800 flex items-center gap-2">
                        <Globe className="h-5 w-5" /> Transferencias y cookies
                    </h2>
                    <div className="mt-3 text-gray-700 space-y-2">
                        <p>
                            Es posible que algunos proveedores procesen datos desde otros países. En tales casos, exigimos
                            <strong> salvaguardas adecuadas</strong> (cláusulas contractuales, certificaciones, medidas técnicas).
                        </p>
                        <p>
                            Usamos <strong>cookies</strong> y tecnologías similares para recordar tu sesión, mejorar el rendimiento
                            y entender el uso del servicio. Puedes gestionar cookies desde la configuración de tu navegador.
                        </p>
                    </div>
                </section>

                {/* Enlaces externos */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-emerald-800 flex items-center gap-2">
                        <LinkIcon className="h-5 w-5" /> Enlaces a otros sitios
                    </h2>
                    <p className="mt-3 text-gray-700">
                        La Plataforma puede contener enlaces a sitios externos. No somos responsables por sus prácticas
                        de privacidad. Revisa sus políticas antes de proporcionar información.
                    </p>
                </section>

                {/* Seguridad */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-emerald-800 flex items-center gap-2">
                        <Lock className="h-5 w-5" /> Seguridad de la información
                    </h2>
                    <div className="mt-3 text-gray-700 space-y-2">
                        <p>
                            Implementamos <strong>medidas técnicas y organizativas</strong> razonables (cifrado en tránsito,
                            control de acceso, registro de auditoría, copias de seguridad y mínimo privilegio) para proteger tus datos.
                        </p>
                        <p className="text-sm text-gray-600">
                            Ningún sistema es 100% infalible, pero trabajamos continuamente para mejorar nuestra seguridad.
                        </p>
                    </div>
                </section>

                {/* Menores */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-emerald-800 flex items-center gap-2">
                        <User className="h-5 w-5" /> Atención a menores
                    </h2>
                    <p className="mt-3 text-gray-700">
                        La atención a menores de edad requiere el consentimiento de padres, madres o representantes legales,
                        conforme a la normativa vigente y a criterio profesional de la Psicóloga.
                    </p>
                </section>

                {/* Cambios a esta política */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-emerald-800 flex items-center gap-2">
                        <FileText className="h-5 w-5" /> Cambios en esta política
                    </h2>
                    <p className="mt-3 text-gray-700">
                        Podemos actualizar esta Política de Privacidad para reflejar cambios legales, operativos o de servicio.
                        Publicaremos la versión vigente en esta página indicando la fecha de última actualización.
                    </p>
                </section>

                {/* Nota legal */}
                <section className="rounded-2xl bg-white border p-6 shadow-sm">
                    <p className="text-xs text-gray-500">
                        Esta política es informativa y no constituye asesoría legal. Si eres la titular del consultorio o la
                        Plataforma, te recomendamos revisar este texto con tu asesoría jurídica local para adecuarlo plenamente a
                        la normativa aplicable.
                    </p>
                </section>
            </main>
        </div>
    )
}

