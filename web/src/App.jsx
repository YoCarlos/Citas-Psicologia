// src/App.jsx
import { Routes, Route } from "react-router-dom"

// Públicas
import Landing from "./pages/Landing.jsx"
import Login from "./pages/Login.jsx"
import Register from "./pages/Register.jsx"
import PrivacyPage from "./pages/PrivacyPage.tsx"
import TermsPage from "./pages/TermsPage.tsx"

// Psicóloga
import PsicoLayout from "./layouts/PsicoLayout.jsx"
import PsicoDashboard from "./pages/psico/Dashboard.jsx"
import PsicoPatients from "./pages/psico/Patients.jsx"
import PsicoAppointments from "./pages/psico/Appointments.jsx"
import PsicoCalendar from "./pages/psico/Calendar.jsx"
import PsicoSettings from "./pages/psico/Settings.jsx"
import RegisterPatient from "./pages/psico/RegisterPatient.jsx"
import ClinicalHistory from "./pages/psico/ClinicalHistory.jsx"
import TherapeuticPlan from "./pages/psico/TherapeuticPlan.jsx"
import BlocksPage from "./pages/psico/BlocksPage.jsx"
import CreateAppointmentSchedule from "./pages/psico/CreateAppointmentSchedule.jsx"
// Paciente
import PatientLayout from "./layouts/PatientLayout.jsx"
import PatientSchedule from "./pages/patient/Schedule.jsx"
import PatientAppointments from "./pages/patient/Appointments.jsx"
import PatientSettings from "./pages/patient/Settings.jsx"
import PatientProfile from "./pages/patient/Profile.jsx"
import PatientCheckOut from "./pages/patient/Checkout.jsx"
import PaymentResult from "./pages/patient/PaymentResult.jsx"
// Protección
import ProtectedRoute from "./components/ProtectedRoute.jsx"

import RequireProfileComplete from "./components/RequireProfileComplete.jsx"

export default function App() {
  return (
    <Routes>
      {/* Públicas */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />

      {/* Panel Psicóloga (solo doctor) */}
      <Route element={<ProtectedRoute requireRole="doctor" />}>
        <Route path="/psico" element={<PsicoLayout />}>
          <Route index element={<PsicoDashboard />} />
          <Route path="pacientes" element={<PsicoPatients />} />
          <Route path="citas" element={<PsicoAppointments />} />
          <Route path="calendario" element={<PsicoCalendar />} />
          <Route path="agendar" element={<CreateAppointmentSchedule />} />
          <Route path="bloquear" element={<BlocksPage />} />
          <Route path="configuracion" element={<PsicoSettings />} />
          <Route path="pacientes/registrar" element={<RegisterPatient />} />
          <Route path="pacientes/:id/historia" element={<ClinicalHistory />} />
          <Route path="pacientes/:id/plan" element={<TherapeuticPlan />} />
        </Route>
      </Route>

      {/* Panel Paciente (solo patient) */}
      <Route element={<ProtectedRoute requireRole="patient" />}>
        <Route path="/paciente" element={<PatientLayout />}>
          {/* Estas requieren perfil completo */}
          <Route
            index
            element={
              <RequireProfileComplete>
                <PatientSchedule />
              </RequireProfileComplete>
            }
          />
          <Route
            path="citas"
            element={
              <RequireProfileComplete>
                <PatientAppointments />
              </RequireProfileComplete>
            }
          />
          <Route
            path="configuracion"
            element={
              <RequireProfileComplete>
                <PatientSettings />
              </RequireProfileComplete>
            }
          />
          <Route
            path="/checkout"
            element={
              <PatientCheckOut>
                <PatientSettings />
              </PatientCheckOut>
            }
          />
          <Route path="payment-result" element={<PaymentResult />} />

          {/* Perfil siempre accesible */}
          <Route path="perfil" element={<PatientProfile />} />
        </Route>
      </Route>
    </Routes>
  )
}
