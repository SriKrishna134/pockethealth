// ========================================
// STEP 5: POCKETHEALTH ASSISTANT EDGE FUNCTION
// Main RAG Pipeline Implementation
// ========================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS headers for frontend integration
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

// ========================================
// Configuration
// ========================================
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? ''

// ========================================
// Helper Functions
// ========================================

/**
 * Verify Supabase JWT and get user
 */
async function verifyAuth(authHeader: string | null) {
  if (!authHeader) return null
  
  const token = authHeader.replace('Bearer ', '')
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  
  // Get user role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  
  return { ...user, role: profile?.role }
}

/**
 * Compute SHA-256 hash of prompt
 */
async function computePromptHash(prompt: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(prompt)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Content moderation using OpenAI
 */
async function moderateContent(prompt: string) {
  try {
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: prompt }),
    })
    
    if (!response.ok) {
      console.error('Moderation API error:', await response.text())
      return { blocked: false, result: null }
    }
    
    const data = await response.json()
    const flagged = data.results?.[0]?.flagged ?? false
    const categories = data.results?.[0]?.categories ?? {}
    
    return { blocked: flagged, result: data, categories }
  } catch (error) {
    console.error('Moderation error:', error)
    return { blocked: false, result: null }
  }
}

/**
 * Generate embedding for text using OpenAI
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-ada-002',
      input: text,
    }),
  })
  
  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status}`)
  }
  
  const data = await response.json()
  return data.data[0].embedding
}

/**
 * Vector similarity search using pgvector
 */
async function vectorSearch(
  supabase: any,
  embedding: number[],
  namespace: string | null,
  topK: number,
  threshold: number
) {
  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: topK,
    filter_namespace: namespace,
  })
  
  if (error) {
    console.error('Vector search error:', error)
    throw error
  }
  
  return data || []
}

/**
 * Retrieve relevant medical records (non-vector fallback)
 */
async function retrieveMedicalRecords(
  supabase: any,
  userId: string,
  userRole: string,
  limit: number = 5
) {
  let query = supabase
    .from('medical_records')
    .select(`
      id,
      symptoms,
      doctor_notes,
      diagnosis,
      medicines,
      lab_results,
      created_at
    `)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  // Apply role-based filtering
  if (userRole === 'PATIENT') {
    // Get patient's own records
    const { data: patient } = await supabase
      .from('patients')
      .select('id')
      .eq('user_id', userId)
      .single()
    
    if (patient) {
      query = query.eq('patient_id', patient.id)
    }
  } else if (userRole === 'DOCTOR') {
    // Get doctor's patients' records
    const { data: doctor } = await supabase
      .from('doctors')
      .select('id')
      .eq('user_id', userId)
      .single()
    
    if (doctor) {
      query = query.eq('doctor_id', doctor.id)
    }
  }
  // ADMIN can see all records (no filter)
  
  const { data, error } = await query
  
  if (error) {
    console.error('Medical records retrieval error:', error)
    return []
  }
  
  return data || []
}

/**
 * Check user quota
 */
async function checkQuota(supabase: any, userId: string): Promise<boolean> {
  const { data: config } = await supabase
    .from('ai_config')
    .select('value')
    .eq('key', 'daily_quota')
    .single()
  
  const dailyLimit = config?.value?.value ?? 100
  
  const { data, error } = await supabase.rpc('check_user_quota', {
    p_user_id: userId,
    daily_limit: dailyLimit,
    monthly_limit: dailyLimit * 30,
  })
  
  return data ?? false
}

/**
 * Call LLM with RAG context
 */
async function callLLM(prompt: string, context: string, model: string = 'gpt-4o-mini') {
  const systemPrompt = `You are a helpful medical assistant for PocketHealth. 
Use ONLY the provided medical records and documents to answer questions.
If the answer is not in the provided context, say "I don't have enough information to answer that."
Always cite which records you're referencing.
Be concise, professional, and accurate.`

  const augmentedPrompt = `CONTEXT FROM MEDICAL RECORDS:
${context}

USER QUESTION: ${prompt}

ANSWER:`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: augmentedPrompt },
      ],
      max_tokens: 800,
      temperature: 0.2,
    }),
  })
  
  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status}`)
  }
  
  const data = await response.json()
  return {
    content: data.choices?.[0]?.message?.content || 'No response generated',
    tokensUsed: data.usage?.total_tokens || 0,
  }
}

/**
 * Log conversation (background task)
 */
function logConversation(
  supabase: any,
  userId: string,
  prompt: string,
  promptHash: string,
  response: string,
  sourceDocIds: string[],
  model: string,
  tokensUsed: number,
  conversationId: string | null
) {
  // Use waitUntil for background logging
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
    EdgeRuntime.waitUntil(
      supabase.from('ai_conversations').insert({
        user_id: userId,
        conversation_id: conversationId,
        prompt,
        prompt_hash: promptHash,
        response,
        source_doc_ids: sourceDocIds,
        model,
        tokens_used: tokensUsed,
      })
    )
  } else {
    // Fallback for local testing
    supabase.from('ai_conversations').insert({
      user_id: userId,
      conversation_id: conversationId,
      prompt,
      prompt_hash: promptHash,
      response,
      source_doc_ids: sourceDocIds,
      model,
      tokens_used: tokensUsed,
    }).then()
  }
}

/**
 * Increment usage counter (background task)
 */
function incrementUsage(supabase: any, userId: string, tokensUsed: number) {
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
    EdgeRuntime.waitUntil(
      supabase.rpc('increment_usage', {
        p_user_id: userId,
        p_tokens: tokensUsed,
      })
    )
  } else {
    supabase.rpc('increment_usage', {
      p_user_id: userId,
      p_tokens: tokensUsed,
    }).then()
  }
}

// ========================================
// Main Request Handler
// ========================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const path = url.pathname

    // Route handling
    if (path.endsWith('/query') && req.method === 'POST') {
      return await handleQuery(req)
    } else if (path.endsWith('/ingest') && req.method === 'POST') {
      return await handleIngest(req)
    } else if (path.endsWith('/reindex') && req.method === 'POST') {
      return await handleReindex(req)
    } else if (path.endsWith('/config') && req.method === 'GET') {
      return await handleConfig(req)
    } else {
      return new Response(
        JSON.stringify({ error: 'Not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } catch (error) {
    console.error('Server error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// ========================================
// Endpoint Handlers
// ========================================

/**
 * POST /query - Main RAG endpoint
 */
async function handleQuery(req: Request) {
  // 1. Verify authentication
  const user = await verifyAuth(req.headers.get('Authorization'))
  if (!user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // 2. Parse request body
  const { prompt, top_k, namespace, conversation_id, use_vector_search } = await req.json()
  
  if (!prompt || typeof prompt !== 'string') {
    return new Response(
      JSON.stringify({ error: 'Invalid prompt' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (prompt.length > 5000) {
    return new Response(
      JSON.stringify({ error: 'Prompt too long (max 5000 characters)' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 3. Check quota
  const hasQuota = await checkQuota(supabase, user.id)
  if (!hasQuota) {
    return new Response(
      JSON.stringify({ error: 'Daily quota exceeded. Please try again tomorrow.' }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // 4. Compute prompt hash
  const promptHash = await computePromptHash(prompt)

  // 5. Moderate content
  const moderation = await moderateContent(prompt)
  if (moderation.blocked) {
    // Log moderation incident
    await supabase.from('ai_moderation_logs').insert({
      user_id: user.id,
      prompt_hash: promptHash,
      prompt_sample: prompt.substring(0, 100),
      result: moderation.result,
      flagged: true,
      categories: moderation.categories,
    })
    
    return new Response(
      JSON.stringify({ 
        error: 'Your request was blocked by our content policy.',
        details: 'Please rephrase your question and try again.'
      }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    let context = ''
    let sourceDocIds: string[] = []
    let sources: any[] = []

    // 6. Retrieval - Choose between vector search or simple retrieval
    if (use_vector_search !== false) {
      try {
        // Generate embedding
        const embedding = await generateEmbedding(prompt)
        
        // Vector similarity search
        const topKValue = top_k || 5
        const threshold = 0.7
        
        const documents = await vectorSearch(
          supabase,
          embedding,
          namespace || null,
          topKValue,
          threshold
        )
        
        if (documents.length > 0) {
          context = documents.map((doc: any) => `
[Document ID: ${doc.id}]
Title: ${doc.title}
Content: ${doc.content}
---`).join('\n')
          
          sourceDocIds = documents.map((doc: any) => doc.id)
          sources = documents.map((doc: any) => ({
            id: doc.id,
            title: doc.title,
            similarity: doc.similarity,
            namespace: doc.namespace,
          }))
        }
      } catch (vectorError) {
        console.error('Vector search failed, falling back to simple retrieval:', vectorError)
        // Fall through to simple retrieval
      }
    }

    // Fallback: Simple medical records retrieval
    if (!context) {
      const records = await retrieveMedicalRecords(supabase, user.id, user.role, 5)
      
      context = records.map((r: any) => `
[Record from: ${r.created_at}]
Symptoms: ${r.symptoms || 'N/A'}
Doctor Notes: ${r.doctor_notes || 'N/A'}
Diagnosis: ${r.diagnosis || 'N/A'}
Medicines: ${r.medicines || 'N/A'}
---`).join('\n')
      
      sourceDocIds = records.map((r: any) => r.id)
      sources = records.map((r: any) => ({
        id: r.id,
        type: 'medical_record',
        date: r.created_at,
      }))
    }

    // 7. Generate AI response
    const { content: answer, tokensUsed } = await callLLM(prompt, context)

    // 8. Log conversation (background)
    logConversation(
      supabase,
      user.id,
      prompt,
      promptHash,
      answer,
      sourceDocIds,
      'gpt-4o-mini',
      tokensUsed,
      conversation_id || null
    )

    // 9. Increment usage (background)
    incrementUsage(supabase, user.id, tokensUsed)

    // 10. Return response
    return new Response(
      JSON.stringify({
        answer,
        sources,
        conversation_id: conversation_id || crypto.randomUUID(),
        tokens_used: tokensUsed,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Query processing error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to process query', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * POST /ingest - Ingest new documents
 */
async function handleIngest(req: Request) {
  const user = await verifyAuth(req.headers.get('Authorization'))
  if (!user || (user.role !== 'ADMIN' && user.role !== 'STAFF')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized. Admin or Staff role required.' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { title, namespace, content, metadata, source_type } = await req.json()
  
  if (!title || !namespace || !content) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: title, namespace, content' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    // Generate embedding
    const embedding = await generateEmbedding(content)
    
    // Insert document
    const { data, error } = await supabase
      .from('documents')
      .insert({
        title,
        namespace,
        content,
        metadata: metadata || {},
        embedding,
        source_type: source_type || 'clinical_guideline',
        created_by: user.id,
        embedding_status: 'completed',
      })
      .select()
      .single()
    
    if (error) throw error
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        document_id: data.id,
        message: 'Document ingested successfully'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Ingestion error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to ingest document', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * POST /reindex - Recompute embeddings
 */
async function handleReindex(req: Request) {
  const user = await verifyAuth(req.headers.get('Authorization'))
  if (!user || user.role !== 'ADMIN') {
    return new Response(
      JSON.stringify({ error: 'Unauthorized. Admin role required.' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    // Get documents with pending or failed embeddings
    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, content')
      .in('embedding_status', ['pending', 'failed'])
      .limit(100)
    
    if (error) throw error
    
    let processed = 0
    let failed = 0
    
    for (const doc of documents || []) {
      try {
        const embedding = await generateEmbedding(doc.content)
        
        await supabase
          .from('documents')
          .update({ 
            embedding, 
            embedding_status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', doc.id)
        
        processed++
      } catch (err) {
        console.error(`Failed to reindex document ${doc.id}:`, err)
        await supabase
          .from('documents')
          .update({ embedding_status: 'failed' })
          .eq('id', doc.id)
        failed++
      }
    }
    
    return new Response(
      JSON.stringify({ 
        success: true,
        processed,
        failed,
        total: documents?.length || 0
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Reindex error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to reindex documents', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * GET /config - Get AI configuration
 */
async function handleConfig(req: Request) {
  const user = await verifyAuth(req.headers.get('Authorization'))
  if (!user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const { data, error } = await supabase
      .from('ai_config')
      .select('key, value, description')
    
    if (error) throw error
    
    const config: Record<string, any> = {}
    for (const item of data || []) {
      config[item.key] = {
        value: item.value?.value,
        description: item.description,
      }
    }
    
    return new Response(
      JSON.stringify({ config }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Config fetch error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch config', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}
