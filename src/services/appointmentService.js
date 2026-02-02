// ========================================
// APPOINTMENT SERVICE
// src/services/appointmentService.js
// ========================================

import { supabase } from './supabaseClient'

/**
 * Get all appointments
 */
export async function getAllAppointments() {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        patient:patient_id (
          id,
          profiles:user_id (
            name,
            email
          )
        ),
        doctor:doctor_id (
          id,
          specialization,
          profiles:user_id (
            name
          )
        )
      `)
      .order('appointment_date', { ascending: false })

    if (error) throw error
    return data
  } catch (error) {
    console.error('Get all appointments error:', error)
    throw error
  }
}

/**
 * Get appointment by ID
 */
export async function getAppointmentById(appointmentId) {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        patient:patient_id (
          id,
          age,
          gender,
          blood_group,
          profiles:user_id (
            name,
            email,
            phone
          )
        ),
        doctor:doctor_id (
          id,
          specialization,
          qualification,
          profiles:user_id (
            name
          )
        )
      `)
      .eq('id', appointmentId)
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Get appointment error:', error)
    throw error
  }
}

/**
 * Create new appointment
 */
export async function createAppointment(appointmentData) {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .insert(appointmentData)
      .select(`
        *,
        patient:patient_id (
          id,
          profiles:user_id (
            name
          )
        ),
        doctor:doctor_id (
          id,
          specialization,
          profiles:user_id (
            name
          )
        )
      `)
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Create appointment error:', error)
    throw error
  }
}

/**
 * Update appointment
 */
export async function updateAppointment(appointmentId, updates) {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', appointmentId)
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Update appointment error:', error)
    throw error
  }
}

/**
 * Cancel appointment
 */
export async function cancelAppointment(appointmentId) {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .update({ status: 'Cancelled' })
      .eq('id', appointmentId)
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Cancel appointment error:', error)
    throw error
  }
}

/**
 * Delete appointment
 */
export async function deleteAppointment(appointmentId) {
  try {
    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', appointmentId)

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Delete appointment error:', error)
    throw error
  }
}

/**
 * Get appointments for current user (patient or doctor)
 */
export async function getMyAppointments() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) throw new Error('Not authenticated')

    // Get user role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile) throw new Error('Profile not found')

    let query = supabase
      .from('appointments')
      .select(`
        *,
        patient:patient_id (
          id,
          profiles:user_id (
            name,
            email
          )
        ),
        doctor:doctor_id (
          id,
          specialization,
          profiles:user_id (
            name
          )
        )
      `)

    // Filter based on role
    if (profile.role === 'PATIENT') {
      const { data: patient } = await supabase
        .from('patients')
        .select('id')
        .eq('user_id', user.id)
        .single()
      
      if (patient) {
        query = query.eq('patient_id', patient.id)
      }
    } else if (profile.role === 'DOCTOR') {
      const { data: doctor } = await supabase
        .from('doctors')
        .select('id')
        .eq('user_id', user.id)
        .single()
      
      if (doctor) {
        query = query.eq('doctor_id', doctor.id)
      }
    }

    const { data, error } = await query.order('appointment_date', { ascending: false })

    if (error) throw error
    return data
  } catch (error) {
    console.error('Get my appointments error:', error)
    throw error
  }
}

/**
 * Get upcoming appointments
 */
export async function getUpcomingAppointments(limit = 5) {
  try {
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        patient:patient_id (
          id,
          profiles:user_id (
            name
          )
        ),
        doctor:doctor_id (
          id,
          specialization,
          profiles:user_id (
            name
          )
        )
      `)
      .gte('appointment_date', today)
      .eq('status', 'Scheduled')
      .order('appointment_date', { ascending: true })
      .limit(limit)

    if (error) throw error
    return data
  } catch (error) {
    console.error('Get upcoming appointments error:', error)
    throw error
  }
}

/**
 * Get all doctors for booking
 */
export async function getAllDoctors() {
  try {
    const { data, error } = await supabase
      .from('doctors')
      .select(`
        *,
        profiles:user_id (
          name,
          email,
          phone
        )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data
  } catch (error) {
    console.error('Get all doctors error:', error)
    throw error
  }
}
