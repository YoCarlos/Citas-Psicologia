import { Link } from "react-router-dom"

export default function Landing() {
    return (
        <div className="min-h-screen bg-gradient-to-b from-emerald-600 via-emerald-500 to-blue-700 text-white">
            {/* NAVBAR */}
            <header className="sticky top-0 z-50 bg-black/10 backdrop-blur-sm border-b border-white/10">
                <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-2xl bg-white/15 flex items-center justify-center shadow">
                            <span className="font-extrabold text-xl">Ψ</span>
                        </div>
                        <div className="leading-tight">
                            <h1 className="font-bold text-lg tracking-tight">CitasPsico</h1>
                            <p className="text-xs text-white/85">Cuidado emocional en línea</p>
                        </div>
                    </div>

                    <nav className="hidden md:flex items-center gap-6">
                        <a href="#hero" className="text-white/90 hover:text-white">Inicio</a>
                        <a href="#mision" className="text-white/90 hover:text-white">Misión</a>
                        <a href="#vision" className="text-white/90 hover:text-white">Visión</a>
                        <a href="#disclaimer" className="text-white/90 hover:text-white">Aviso</a>
                        <a href="#servicios" className="text-white/90 hover:text-white">Servicios</a>
                        <a href="#faq" className="text-white/90 hover:text-white">FAQ</a>
                        <Link
                            to="/login"
                            className="px-4 py-2 rounded-xl bg-white text-emerald-700 font-semibold hover:opacity-90 shadow-sm"
                        >
                            Iniciar sesión
                        </Link>

                        <Link
                            to="/register"
                            className="px-4 py-2 rounded-xl bg-blue-700 text-white font-semibold hover:opacity-90 shadow-sm"
                        >
                            Registrate
                        </Link>
                    </nav>

                    {/* acción principal en móvil */}
                    <div className="md:hidden">
                        <Link
                            to="/login"
                            className="px-3 py-2 rounded-xl bg-white text-emerald-700 font-semibold shadow-sm"
                        >
                            Entrar
                        </Link>
                    </div>
                </div>
            </header>

            {/* HERO */}
            <section id="hero" className="relative">
                <div className="max-w-6xl mx-auto px-4 py-16 md:py-20 grid md:grid-cols-2 gap-10 items-center">
                    <div>
                        <h2 className="text-4xl md:text-5xl font-extrabold leading-tight tracking-tight">
                            Psicoterapia en línea{" "}
                            <span className="block text-emerald-50">segura, humana y cercana.</span>
                        </h2>
                        <p className="mt-5 text-emerald-50/90 text-lg leading-relaxed">
                            Agenda y atiende tus sesiones virtuales sin fricción. Calendario en tiempo real,
                            recordatorios y videollamada integrada.
                        </p>
                        <div className="mt-8 flex flex-wrap gap-4">
                            <Link
                                to="/login"
                                className="px-5 py-3 rounded-2xl bg-white text-emerald-700 font-semibold hover:opacity-90 shadow"
                            >
                                Entrar / Registrarme
                            </Link>
                            <a
                                href="#servicios"
                                className="px-5 py-3 rounded-2xl border border-white/50 text-white font-semibold hover:bg-white/10"
                            >
                                Ver servicios
                            </a>
                        </div>

                        <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-emerald-50/85">
                            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 border border-white/20">
                                <span className="h-2 w-2 rounded-full bg-emerald-300" /> Agenda 24/7
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 border border-white/20">
                                <span className="h-2 w-2 rounded-full bg-emerald-300" /> América/Guayaquil (UTC-5)
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 border border-white/20">
                                <span className="h-2 w-2 rounded-full bg-emerald-300" /> Confidencialidad
                            </span>
                        </div>
                    </div>

                    <div className="bg-white/10 rounded-3xl p-6 border border-white/20 shadow-xl">
                        <div className="grid gap-4">
                            {[
                                { t: "Agenda inteligente", d: "Disponibilidad en tiempo real y confirmación inmediata." },
                                { t: "Recordatorios", d: "Alertas por email/WhatsApp* antes de cada cita." },
                                { t: "Videollamada segura", d: "Sesiones por Zoom desde tu panel de paciente." },
                            ].map((x, i) => (
                                <div key={i} className="rounded-2xl bg-white/15 p-4 border border-white/20">
                                    <h3 className="font-semibold">{x.t}</h3>
                                    <p className="text-sm text-white/90">{x.d}</p>
                                </div>
                            ))}
                        </div>
                        <p className="mt-3 text-[11px] text-white/70">
                            *WhatsApp sujeto a configuración del consultorio y costos del proveedor.
                        </p>
                    </div>
                </div>
            </section>

            {/* MISIÓN / VISIÓN */}
            <section id="mision" className="bg-white text-gray-800">
                <div className="max-w-6xl mx-auto px-4 py-16 grid md:grid-cols-2 gap-8">
                    <div className="rounded-3xl border border-emerald-100 p-8 shadow-sm">
                        <h3 className="text-2xl font-bold text-emerald-700 tracking-tight">Misión</h3>
                        <p className="mt-3 text-gray-600 leading-relaxed">
                            Brindar atención psicológica accesible, cálida y de calidad, facilitando el vínculo
                            terapéutico mediante tecnología simple y humana.
                        </p>
                    </div>
                    <div id="vision" className="rounded-3xl border border-blue-100 p-8 shadow-sm">
                        <h3 className="text-2xl font-bold text-blue-700 tracking-tight">Visión</h3>
                        <p className="mt-3 text-gray-600 leading-relaxed">
                            Ser la plataforma de referencia en psicoterapia en línea de la región por calidez,
                            seguridad y eficacia en los procesos terapéuticos.
                        </p>
                    </div>
                </div>
            </section>

            {/* DISCLAIMER (su propia sección, suave y elegante) */}
            <section id="disclaimer" className="bg-emerald-50 text-emerald-950">
                <div className="max-w-6xl mx-auto px-4 py-12">
                    <div className="rounded-3xl border border-emerald-200/70 bg-white/80 backdrop-blur-sm p-6 md:p-8 shadow-sm">
                        <h2 className="text-xl md:text-2xl font-bold tracking-tight text-emerald-800">
                            Aviso importante
                        </h2>
                        <div className="mt-3 space-y-3 text-[15px] leading-relaxed">
                            <p>
                                <strong>Atendemos de forma privada</strong>: no atendemos por ninguna obra social o prepaga.
                            </p>
                            <p>
                                En caso de <strong>urgencia</strong>, comunícate con el <strong>101</strong>, <strong>911</strong>,
                                o acude al centro de salud más cercano. Esta plataforma no brinda atención de emergencia.
                            </p>
                            <details className="rounded-xl bg-white p-4 border border-emerald-200 open:shadow-sm">
                                <summary className="cursor-pointer font-semibold text-emerald-900">
                                    Números de emergencia por país (referenciales)
                                </summary>
                                <ul className="mt-3 grid sm:grid-cols-2 gap-2 text-sm text-emerald-900">
                                    <li><strong>Ecuador:</strong> 911</li>
                                    <li><strong>Argentina:</strong> 911 / 107 (ambulancia)</li>
                                    <li><strong>Chile:</strong> 131 (ambulancia) / 133 (policía)</li>
                                    <li><strong>México:</strong> 911</li>
                                    <li><strong>Estados Unidos:</strong> 911</li>
                                    <li><strong>España:</strong> 112</li>
                                </ul>
                                <p className="mt-2 text-xs text-emerald-800/80">
                                    *Verifica el número vigente en tu localidad.
                                </p>
                            </details>
                            <p>
                                Si atraviesas <strong>pensamientos suicidas</strong>, busca un{" "}
                                <strong>centro especializado</strong>, preferentemente <strong>presencial</strong>.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* SERVICIOS */}
            <section id="servicios" className="bg-gradient-to-b from-white to-emerald-50 text-gray-800">
                <div className="max-w-6xl mx-auto px-4 py-16">
                    <h3 className="text-3xl font-extrabold text-center text-emerald-700 tracking-tight">
                        Servicios
                    </h3>
                    <p className="text-center text-gray-600 mt-2">
                        Sesiones individuales, seguimiento y procesos psicoeducativos.
                    </p>

                    <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[
                            {
                                title: "Sesión de evaluación",
                                desc: "Primera entrevista para comprender tu motivo de consulta y definir un plan.",
                            },
                            {
                                title: "Terapia individual",
                                desc: "Sesiones enfocadas en tus objetivos personales, con seguimiento.",
                            },
                            {
                                title: "Psicoeducación",
                                desc: "Recursos y estrategias prácticas para tu día a día.",
                            },
                        ].map((s, i) => (
                            <div
                                key={i}
                                className="rounded-3xl bg-white p-6 border border-emerald-100 shadow-sm hover:shadow-md transition-shadow"
                            >
                                <h4 className="font-semibold text-emerald-700">{s.title}</h4>
                                <p className="mt-2 text-gray-600 leading-relaxed">{s.desc}</p>
                                <div className="mt-5">
                                    <Link
                                        to="/login"
                                        className="inline-block px-4 py-2 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700"
                                    >
                                        Agendar
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-12 text-center">
                        <Link
                            to="/login"
                            className="inline-block px-6 py-3 rounded-2xl bg-blue-700 text-white font-semibold hover:bg-blue-800 shadow"
                        >
                            Iniciar sesión
                        </Link>
                    </div>
                </div>
            </section>

            {/* FAQ (con más aire para no pegarse a bordes) */}
            <section id="faq" className="px-4 py-16">
                <div className="max-w-6xl mx-auto">
                    <div className="bg-white/10 border border-white/20 rounded-3xl p-6 md:p-8">
                        <h3 className="text-2xl font-bold tracking-tight">Preguntas frecuentes</h3>
                        <div className="mt-6 grid md:grid-cols-2 gap-5">
                            <details className="bg-black/10 rounded-2xl p-4 border border-white/10">
                                <summary className="cursor-pointer font-semibold">¿Necesito instalar algo para la videollamada?</summary>
                                <p className="mt-2 text-white/90 text-sm">
                                    No. Recibirás el enlace de Zoom en tus recordatorios y podrás ingresar desde navegador o app.
                                </p>
                            </details>
                            <details className="bg-black/10 rounded-2xl p-4 border border-white/10">
                                <summary className="cursor-pointer font-semibold">¿Puedo reprogramar una cita?</summary>
                                <p className="mt-2 text-white/90 text-sm">
                                    Sí, desde tu panel puedes reprogramar con antelación según disponibilidad.
                                </p>
                            </details>
                            <details className="bg-black/10 rounded-2xl p-4 border border-white/10">
                                <summary className="cursor-pointer font-semibold">¿Cómo se envían los recordatorios?</summary>
                                <p className="mt-2 text-white/90 text-sm">
                                    Por email y, si está activo, por WhatsApp. La hora se ajusta a tu zona horaria.
                                </p>
                            </details>
                            <details className="bg-black/10 rounded-2xl p-4 border border-white/10">
                                <summary className="cursor-pointer font-semibold">¿La información es confidencial?</summary>
                                <p className="mt-2 text-white/90 text-sm">
                                    Sí, aplicamos buenas prácticas de seguridad y solo la profesional tratante accede a tus datos clínicos.
                                </p>
                            </details>
                        </div>
                    </div>
                </div>
            </section>

            {/* FOOTER */}
            <footer className="border-t border-white/15 bg-black/10 backdrop-blur-sm">
                <div className="max-w-6xl mx-auto px-4 py-10">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                        <div className="space-y-1">
                            <p className="text-white/85 text-sm">
                                © {new Date().getFullYear()} CitasPsico — Todos los derechos reservados
                            </p>
                            <p className="text-white/70 text-xs">
                                Plataforma para agendar consultas psicológicas en línea. No sustituye atención de emergencia.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-sm">
                            <Link to="/terms" className="text-white/85 hover:text-white underline-offset-4 hover:underline">
                                Términos y Condiciones
                            </Link>
                            <Link to="/privacy" className="text-white/85 hover:text-white underline-offset-4 hover:underline">
                                Política de Privacidad
                            </Link>
                            <Link to="/login" className="text-white font-semibold hover:underline underline-offset-4">
                                Entrar
                            </Link>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    )
}
