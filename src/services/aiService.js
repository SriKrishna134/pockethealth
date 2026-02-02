// ========================================
// STEP 6: REACT FRONTEND - AI SERVICE
// src/services/aiService.js
// ========================================

import { supabase } from './supabaseClient'

/**
 * AI Service - Handles all AI/RAG interactions
 */

const EDGE_FUNCTION_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/pockethealth-assistant'

/**
 * Query the AI assistant with RAG
 * @param {string} prompt - User's question
 * @param {Object} options - Optional parameters
 * @returns {Promise<Object>} AI response with sources
 */
export async function queryAI(prompt, options = {}) {
  try {
    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError || !session) {
      throw new Error('You must be logged in to use the AI assistant')
    }

    // Call Edge Function
    const response = await fetch(`${EDGE_FUNCTION_URL}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        top_k: options.topK || 5,
        namespace: options.namespace || null,
        conversation_id: options.conversationId || null,
        use_vector_search: options.useVectorSearch !== false,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to get AI response')
    }

    const data = await response.json()
    return {
      answer: data.answer,
      sources: data.sources || [],
      conversationId: data.conversation_id,
      tokensUsed: data.tokens_used,
    }
  } catch (error) {
    console.error('AI Service Error:', error)
    throw error
  }
}

/**
 * Ingest a new document into the knowledge base
 * @param {Object} document - Document details
 * @returns {Promise<Object>} Ingestion result
 */
export async function ingestDocument(document) {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError || !session) {
      throw new Error('You must be logged in to ingest documents')
    }

    const response = await fetch(`${EDGE_FUNCTION_URL}/ingest`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: document.title,
        namespace: document.namespace,
        content: document.content,
        metadata: document.metadata || {},
        source_type: document.sourceType || 'clinical_guideline',
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to ingest document')
    }

    return await response.json()
  } catch (error) {
    console.error('Document Ingestion Error:', error)
    throw error
  }
}

/**
 * Trigger reindexing of documents
 * @returns {Promise<Object>} Reindex result
 */
export async function reindexDocuments() {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError || !session) {
      throw new Error('You must be logged in')
    }

    const response = await fetch(`${EDGE_FUNCTION_URL}/reindex`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to reindex documents')
    }

    return await response.json()
  } catch (error) {
    console.error('Reindex Error:', error)
    throw error
  }
}

/**
 * Get AI configuration
 * @returns {Promise<Object>} Configuration object
 */
export async function getAIConfig() {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError || !session) {
      throw new Error('You must be logged in')
    }

    const response = await fetch(`${EDGE_FUNCTION_URL}/config`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to get config')
    }

    const data = await response.json()
    return data.config
  } catch (error) {
    console.error('Config Fetch Error:', error)
    throw error
  }
}

/**
 * Get user's conversation history
 * @param {number} limit - Number of conversations to fetch
 * @returns {Promise<Array>} Conversation history
 */
export async function getConversationHistory(limit = 10) {
  try {
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return data
  } catch (error) {
    console.error('Failed to fetch conversation history:', error)
    throw error
  }
}

/**
 * Get user's AI usage statistics
 * @param {number} days - Number of days to look back
 * @returns {Promise<Object>} Usage statistics
 */
export async function getUsageStats(days = 30) {
  try {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const { data, error } = await supabase
      .from('ai_usage')
      .select('*')
      .gte('date', startDate.toISOString().split('T')[0])
      .order('date', { ascending: true })

    if (error) throw error

    const totalRequests = data.reduce((sum, day) => sum + day.requests, 0)
    const totalTokens = data.reduce((sum, day) => sum + day.tokens, 0)

    return {
      dailyUsage: data,
      totalRequests,
      totalTokens,
      avgRequestsPerDay: totalRequests / Math.max(data.length, 1),
    }
  } catch (error) {
    console.error('Failed to fetch usage stats:', error)
    throw error
  }
}

/**
 * Search documents in the knowledge base
 * @param {string} searchTerm - Search term
 * @param {string} namespace - Optional namespace filter
 * @returns {Promise<Array>} Matching documents
 */
export async function searchDocuments(searchTerm, namespace = null) {
  try {
    let query = supabase
      .from('documents')
      .select('id, title, namespace, metadata, created_at')
      .ilike('title', `%${searchTerm}%`)

    if (namespace) {
      query = query.eq('namespace', namespace)
    }

    const { data, error } = await query.limit(20)

    if (error) throw error
    return data
  } catch (error) {
    console.error('Document search error:', error)
    throw error
  }
}
