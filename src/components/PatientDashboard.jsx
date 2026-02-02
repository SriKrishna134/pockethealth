import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentUserProfile, logout } from '../services/authService'
import { getCurrentPatientProfile, getPatientMedicalRecords } from '../services/patientService'
import { getMyAppointments } from '../services/appointmentService'

export default function PatientDashboard() {
  const [profile, setProfile] = useState(null)
  const [patient, setPatient] = useState(null)
  const [appointments, setAppointments] = useState([])
  const [medicalRecords, setMedicalRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    setLoading(true)

    // Get user profile
    const { profile: userProfile } = await getCurrentUserProfile()
    if (!userProfile) {
      navigate('/login')
      return
    }
    setProfile(userProfile)

    // Get patient data
    const { patient: patientData } = await getCurrentPatientProfile()
    setPatient(patientData)

    // Get appointments
    const { appointments: appointmentsData } = await getMyAppointments()
    setAppointments(appointmentsData)

    // Get medical records
    if (patientData?.id) {
      const { records } = await getPatientMedicalRecords(patientData.id)
      setMedicalRecords(records)
    }

    setLoading(false)
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">PocketHealth</h1>
            <p className="text-sm text-gray-600">Welcome, {profile?.name}</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => navigate('/ai-assistant')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              AI Assistant
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Total Appointments</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">{appointments.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Medical Records</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">{medicalRecords.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Upcoming</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {appointments.filter(a => a.status === 'Scheduled').length}
            </p>
          </div>
        </div>

        {/* Recent Appointments */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recent Appointments</h2>
          </div>
          <div className="p-6">
            {appointments.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No appointments yet</p>
            ) : (
              <div className="space-y-4">
                {appointments.slice(0, 5).map((appointment) => (
                  <div
                    key={appointment.id}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        Dr. {appointment.doctor?.profiles?.name || 'N/A'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {appointment.doctor?.specialization}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {new Date(appointment.appointment_date).toLocaleDateString()} at{' '}
                        {appointment.appointment_time}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        appointment.status === 'Scheduled'
                          ? 'bg-blue-100 text-blue-800'
                          : appointment.status === 'Completed'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {appointment.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Medical Records */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recent Medical Records</h2>
          </div>
          <div className="p-6">
            {medicalRecords.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No medical records yet</p>
            ) : (
              <div className="space-y-4">
                {medicalRecords.slice(0, 5).map((record) => (
                  <div
                    key={record.id}
                    className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium text-gray-900">{record.diagnosis || 'Checkup'}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(record.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <p className="text-xs text-gray-500">
                        Dr. {record.doctor?.profiles?.name || 'N/A'}
                      </p>
                    </div>
                    {record.symptoms && (
                      <p className="text-sm text-gray-600 mb-1">
                        <span className="font-medium">Symptoms:</span> {record.symptoms}
                      </p>
                    )}
                    {record.medicines && (
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Medicines:</span> {record.medicines}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => navigate('/book-appointment')}
            className="p-6 bg-blue-50 border-2 border-blue-200 rounded-lg hover:bg-blue-100 text-left"
          >
            <h3 className="font-semibold text-blue-900 mb-1">Book Appointment</h3>
            <p className="text-sm text-blue-700">Schedule a visit with a doctor</p>
          </button>
          <button
            onClick={() => navigate('/ai-assistant')}
            className="p-6 bg-green-50 border-2 border-green-200 rounded-lg hover:bg-green-100 text-left"
          >
            <h3 className="font-semibold text-green-900 mb-1">Ask AI Assistant</h3>
            <p className="text-sm text-green-700">Get answers about your health records</p>
          </button>
        </div>
      </main>
    </div>
  )
}
