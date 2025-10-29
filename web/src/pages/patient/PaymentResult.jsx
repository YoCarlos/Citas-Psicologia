import React from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { CheckCircle, XCircle, Clock4, ArrowLeft } from "lucide-react"

export default function PaymentResult() {
    const location = useLocation()
    const navigate = useNavigate()

    // Captura parámetros ?status=success|failed|pending&txn_id=...
    const params = new URLSearchParams(location.search)
    const status = params.get("status") || "pending"
    const txnId = params.get("txn_id")
    const amount = params.get("amount")

    const isSuccess = status === "success"
    const isFailed = status === "failed"
    const isPending = status === "pending"

    const handleGoHome = () => navigate("/paciente/appointments")

    return (
        <div className=" flex items-center justify-center bg-gray-50 p-6">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center border">
                {isSuccess && (
                    <>
                        <CheckCircle className="h-16 w-16 text-emerald-600 mx-auto" />
                        <h1 className="mt-4 text-2xl font-bold text-emerald-700">
                            ¡Pago exitoso!
                        </h1>
                        <p className="mt-2 text-gray-600">
                            Tu cita ha sido confirmada correctamente.
                        </p>
                    </>
                )}

                {isFailed && (
                    <>
                        <XCircle className="h-16 w-16 text-rose-600 mx-auto" />
                        <h1 className="mt-4 text-2xl font-bold text-rose-700">
                            Error en el pago
                        </h1>
                        <p className="mt-2 text-gray-600">
                            El pago no se pudo completar. Por favor intenta nuevamente.
                        </p>
                    </>
                )}

                {isPending && (
                    <>
                        <Clock4 className="h-16 w-16 text-amber-500 mx-auto" />
                        <h1 className="mt-4 text-2xl font-bold text-amber-600">
                            Pago en proceso
                        </h1>
                        <p className="mt-2 text-gray-600">
                            Estamos esperando la confirmación del pago. Esto puede tardar unos segundos.
                        </p>
                    </>
                )}

                <div className="mt-6 space-y-1 text-sm text-gray-500">
                    {txnId && <p><strong>ID de transacción:</strong> {txnId}</p>}
                    {amount && <p><strong>Monto:</strong> ${Number(amount).toFixed(2)}</p>}
                </div>

                <button
                    onClick={handleGoHome}
                    className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Volver a mis citas
                </button>
            </div>
        </div>
    )
}
