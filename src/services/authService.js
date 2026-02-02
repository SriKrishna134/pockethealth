// ========================================
// AUTHENTICATION SERVICE
// src/services/authService.js
// ========================================

import { supabase } from './supabaseClient'

/**
 * Register a new user
 */
export async function register(email, password, name, role = 'PATIENT') {
  try {
    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authError) throw authError

    if (!authData.user) {
      throw new Error('User creation failed')
    }

    // 2. Create profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        role,
        name,
        email,
      })

    if (profileError) throw profileError

    // 3. Create role-specific record
    if (role === 'PATIENT') {
      const { error: patientError } = await supabase
        .from('patients')
        .insert({
          user_id: authData.user.id,
        })

      if (patientError) throw patientError
    } else if (role === 'DOCTOR') {
      const { error: doctorError } = await supabase
        .from('doctors')
        .insert({
          user_id: authData.user.id,
          specialization: 'General Medicine',
          qualification: 'MBBS',
          experience_years: 0,
        })

      if (doctorError) throw doctorError
    }

    return { user: authData.user, session: authData.session }
  } catch (error) {
    console.error('Registration error:', error)
    throw error
  }
}

/**
 * Login user
 */
export async function login(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error

    // Get user profile to check role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, name')
      .eq('id', data.user.id)
      .single()

    if (profileError) throw profileError

    return {
      user: data.user,
      session: data.session,
      profile,
    }
  } catch (error) {
    console.error('Login error:', error)
    throw error
  }
}

/**
 * Logout user
 */
export async function logout() {
  try {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  } catch (error) {
    console.error('Logout error:', error)
    throw error
  }
}

/**
 * Get current session
 */
export async function getSession() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error) throw error
    return session
  } catch (error) {
    console.error('Get session error:', error)
    return null
  }
}

/**
 * Get current user profile
 */
export async function getCurrentUserProfile() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) return null

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error) throw error
    
    return { ...user, ...profile }
  } catch (error) {
    console.error('Get profile error:', error)
    return null
  }
}

/**
 * Update user profile
 */
export async function updateProfile(updates) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) throw new Error('Not authenticated')

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)

    if (error) throw error
    
    return { success: true }
  } catch (error) {
    console.error('Update profile error:', error)
    throw error
  }
}

/**
 * Change password
 */
export async function changePassword(newPassword) {
  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) throw error
    
    return { success: true }
  } catch (error) {
    console.error('Change password error:', error)
    throw error
  }
}
