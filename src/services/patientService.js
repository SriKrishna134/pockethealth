// ========================================
// PATIENT SERVICE
// src/services/patientService.js
// ========================================

import { supabase } from './supabaseClient'

/**
 * Get all patients (for doctors and admins)
 */
export async function getAllPatients() {
  try {
    const { data, error } = await supabase
      .from('patients')
      .select(`
        *,
        profiles:user_id (
          id,
          name,
          email,
          phone
        )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data
  } catch (error) {
    console.error('Get all patients error:', error)
    throw error
  }
}

/**
 * Get patient by ID
 */
export async function getPatientById(patientId) {
  try {
    const { data, error } = await supabase
      .from('patients')
      .select(`
        *,
        profiles:user_id (
          id,
          name,
          email,
          phone
        )
      `)
      .eq('id', patientId)
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Get patient error:', error)
    throw error
  }
}

/**
 * Get current user's patient record
 */
export async function getCurrentPatientProfile() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('patients')
      .select(`
        *,
        profiles:user_id (
          id,
          name,
          email,
          phone
        )
      `)
      .eq('user_id', user.id)
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Get current patient error:', error)
    throw error
  }
}

/**
 * Update patient record
 */
export async function updatePatient(patientId, updates) {
  try {
    const { data, error } = await supabase
      .from('patients')
      .update(updates)
      .eq('id', patientId)
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Update patient error:', error)
    throw error
  }
}

/**
 * Create new patient
 */
export async function createPatient(patientData) {
  try {
    const { data, error } = await supabase
      .from('patients')
      .insert(patientData)
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Create patient error:', error)
    throw error
  }
}

/**
 * Delete patient
 */
export async function deletePatient(patientId) {
  try {
    const { error } = await supabase
      .from('patients')
      .delete()
      .eq('id', patientId)

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Delete patient error:', error)
    throw error
  }
}

/**
 * Get patient's medical records
 */
export async function getPatientMedicalRecords(patientId) {
  try {
    const { data, error } = await supabase
      .from('medical_records')
      .select(`
        *,
        doctor:doctor_id (
          id,
          specialization,
          profiles:user_id (
            name
          )
        )
      `)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data
  } catch (error) {
    console.error('Get medical records error:', error)
    throw error
  }
}

/**
 * Get patient's appointments
 */
export async function getPatientAppointments(patientId) {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        doctor:doctor_id (
          id,
          specialization,
          profiles:user_id (
            name
          )
        )
      `)
      .eq('patient_id', patientId)
      .order('appointment_date', { ascending: false })

    if (error) throw error
    return data
  } catch (error) {
    console.error('Get appointments error:', error)
    throw error
  }
}
