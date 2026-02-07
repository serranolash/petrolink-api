const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
const { analyzeCandidateWithAI } = require('../services/aiService');
const { normalizeText, buildSkillsIndex } = require('../utils/textProcessors');
const { validateApiKey, logRequest } = require('../middleware/security');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Initialize Supabase (replacing Firebase for API scalability)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting per API key
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each API key to 100 requests per windowMs
  keyGenerator: (req) => req.apiKey || req.ip,
  message: {
    error: 'Too many requests from this API key',
    retryAfter: '15 minutes'
  }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Authentication middleware
app.use('/v1/', validateApiKey);

// Request logging
app.use('/v1/', logRequest);

// Health check endpoint (public)
app.get('/health', (req, res) => {
  res.json({
    status: 'operational',
    version: '1.0.0-beta',
    timestamp: new Date().toISOString(),
    services: {
      ai_processing: 'operational',
      database: 'connected',
      queue: 'active'
    }
  });
});

// ==================== CORE API ENDPOINTS ====================

/**
 * POST /v1/analyze/profile
 * Analyzes a candidate profile from structured data
 */
app.post('/v1/analyze/profile', apiLimiter, async (req, res) => {
  try {
    const requestId = uuidv4();
    const startTime = Date.now();
    
    // Validate input
    const { profile, options = {} } = req.body;
    
    if (!profile) {
      return res.status(400).json({
        requestId,
        error: 'Missing required field: profile',
        code: 'VALIDATION_ERROR'
      });
    }

    // Enhanced candidate object with metadata
    const candidateWithMetadata = {
      id: `api_${requestId}`,
      ...profile,
      metadata: {
        source: options.source || 'api_direct',
        clientId: req.clientId,
        receivedAt: new Date().toISOString(),
        apiVersion: '1.0.0-beta'
      }
    };

    // AI Analysis
    const aiAnalysis = await analyzeCandidateWithAI(candidateWithMetadata);
    
    // Build skills index
    const skillsIndex = buildSkillsIndex({
      ...candidateWithMetadata,
      ai_analysis_v2: aiAnalysis
    });

    // Enriched response
    const enrichedAnalysis = {
      ...aiAnalysis,
      skills_enhanced: skillsIndex,
      readiness_score: aiAnalysis.readiness_auto?.score || 0,
      market_fit: aiAnalysis.market_fit_score || 0,
      potential_score: aiAnalysis.potential_score || 0
    };

    // Cache results in Supabase for 24 hours
    await supabase
      .from('api_analysis_cache')
      .insert({
        request_id: requestId,
        client_id: req.clientId,
        profile_hash: generateProfileHash(profile),
        analysis_result: enrichedAnalysis,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      });

    const processingTime = Date.now() - startTime;

    // Success response
    res.status(200).json({
      requestId,
      status: 'success',
      processingTime: `${processingTime}ms`,
      analysis: enrichedAnalysis,
      _links: {
        self: `${req.protocol}://${req.get('host')}/v1/analyze/profile`,
        batch: `${req.protocol}://${req.get('host')}/v1/analyze/batch`,
        search: `${req.protocol}://${req.get('host')}/v1/search`
      }
    });

  } catch (error) {
    console.error(`API Error [${req.requestId}]:`, error);
    
    res.status(500).json({
      requestId: req.requestId,
      error: 'Internal server error during analysis',
      code: 'ANALYSIS_FAILED',
      detail: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /v1/analyze/cv
 * Processes raw CV text or PDF (base64 encoded)
 */
app.post('/v1/analyze/cv', apiLimiter, async (req, res) => {
  try {
    const requestId = uuidv4();
    const { cv_text, cv_pdf_base64, extraction_options = {} } = req.body;

    if (!cv_text && !cv_pdf_base64) {
      return res.status(400).json({
        requestId,
        error: 'Either cv_text or cv_pdf_base64 must be provided',
        code: 'CV_REQUIRED'
      });
    }

    let extractedText = cv_text;

    // PDF processing if base64 provided
    if (cv_pdf_base64 && !cv_text) {
      extractedText = await extractTextFromPDF(cv_pdf_base64);
    }

    // Parse CV text into structured profile
    const parsedProfile = await parseCVToProfile(extractedText, extraction_options);

    // Forward to profile analysis
    const proxyReq = {
      body: {
        profile: parsedProfile,
        options: { source: 'cv_upload', ...extraction_options }
      },
      clientId: req.clientId,
      requestId
    };

    // Simulate internal call to profile endpoint
    const analysisResponse = await analyzeProfileInternal(proxyReq);

    res.status(200).json({
      requestId,
      status: 'success',
      cv_processing: {
        text_length: extractedText.length,
        language_detected: detectLanguage(extractedText),
        sections_identified: parsedProfile.sections || []
      },
      ...analysisResponse
    });

  } catch (error) {
    res.status(500).json({
      requestId: req.requestId,
      error: 'CV processing failed',
      code: 'CV_PROCESSING_ERROR'
    });
  }
});

/**
 * GET /v1/search
 * Search across analyzed profiles with advanced filters
 */
app.get('/v1/search', apiLimiter, async (req, res) => {
  try {
    const {
      query,
      skills,
      industry,
      min_score,
      location,
      experience_years,
      page = 1,
      limit = 20
    } = req.query;

    // Build Elasticsearch-like query for Supabase
    const searchQuery = supabase
      .from('analyzed_profiles')
      .select('*', { count: 'exact' })
      .eq('client_id', req.clientId)
      .eq('is_active', true);

    // Apply filters
    if (query) {
      searchQuery.or(`skills_enhanced.cs.{${query}},industry.ilike.%${query}%`);
    }

    if (skills) {
      const skillsArray = skills.split(',');
      searchQuery.contains('skills_enhanced', skillsArray);
    }

    if (industry) {
      searchQuery.eq('industry', industry);
    }

    if (min_score) {
      searchQuery.gte('potential_score', parseFloat(min_score));
    }

    // Pagination
    const from = (page - 1) * limit;
    searchQuery.range(from, from + limit - 1);

    // Execute query
    const { data, error, count } = await searchQuery;

    if (error) throw error;

    res.json({
      requestId: uuidv4(),
      status: 'success',
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        total_pages: Math.ceil(count / limit)
      },
      results: data,
      facets: await generateSearchFacets(req.clientId)
    });

  } catch (error) {
    res.status(500).json({
      requestId: req.requestId,
      error: 'Search failed',
      code: 'SEARCH_ERROR'
    });
  }
});

/**
 * POST /v1/batch/analyze
 * Asynchronous batch processing
 */
app.post('/v1/batch/analyze', async (req, res) => {
  try {
    const { profiles = [], callback_url } = req.body;
    
    if (!profiles.length) {
      return res.status(400).json({
        error: 'No profiles provided for batch processing',
        code: 'BATCH_EMPTY'
      });
    }

    const batchId = uuidv4();
    
    // Immediate response for async processing
    res.status(202).json({
      batchId,
      status: 'processing',
      message: 'Batch analysis queued for processing',
      profiles_received: profiles.length,
      callback_url,
      _links: {
        status: `${req.protocol}://${req.get('host')}/v1/batch/${batchId}/status`,
        cancel: `${req.protocol}://${req.get('host')}/v1/batch/${batchId}/cancel`
      }
    });

    // Queue batch processing (non-blocking)
    processBatchAsync(batchId, profiles, req.clientId, callback_url);

  } catch (error) {
    res.status(500).json({
      error: 'Batch processing initialization failed',
      code: 'BATCH_INIT_ERROR'
    });
  }
});

// ==================== HELPER FUNCTIONS ====================

/**
 * Generate a unique hash for profile caching
 */
function generateProfileHash(profile) {
  const crypto = require('crypto');
  const profileString = JSON.stringify({
    name: profile.nombre || profile.name,
    experience: profile.experienciaOilGas || profile.experience,
    skills: profile.habilidades || profile.skills
  });
  
  return crypto
    .createHash('sha256')
    .update(profileString)
    .digest('hex')
    .substring(0, 32);
}

/**
 * Extract text from PDF base64
 */
async function extractTextFromPDF(base64String) {
  // In production, use a service like AWS Textract or Google Document AI
  // This is a simplified version using pdf-parse if PDF.js is available
  try {
    const pdf = require('pdf-parse');
    const buffer = Buffer.from(base64String, 'base64');
    const data = await pdf(buffer);
    return data.text;
  } catch (error) {
    console.error('PDF extraction failed:', error);
    throw new Error('PDF processing not available');
  }
}

/**
 * Parse raw CV text into structured profile
 */
async function parseCVToProfile(cvText, options = {}) {
  // Use AI service to parse CV text
  // This is a placeholder - integrate with your CV parsing service
  return {
    nombre: 'Extracted from CV',
    experienciaOilGas: 'Extracted experience',
    habilidades: ['skill1', 'skill2'],
    descripcion: cvText.substring(0, 500) + '...',
    metadata: {
      parsing_engine: 'ai_parser_v1',
      confidence: 0.85
    }
  };
}

/**
 * Internal profile analysis function
 */
async function analyzeProfileInternal(req) {
  // This function simulates the profile analysis endpoint logic
  // without going through HTTP for internal calls
  const { profile, options } = req.body;
  
  const aiAnalysis = await analyzeCandidateWithAI({
    id: `internal_${req.requestId}`,
    ...profile
  });

  return {
    analysis: aiAnalysis,
    metadata: {
      internal_request: true,
      clientId: req.clientId
    }
  };
}

/**
 * Async batch processor
 */
async function processBatchAsync(batchId, profiles, clientId, callbackUrl) {
  const results = [];
  const errors = [];
  
  for (const [index, profile] of profiles.entries()) {
    try {
      const analysis = await analyzeCandidateWithAI(profile);
      results.push({
        profile_id: index + 1,
        status: 'success',
        analysis
      });
    } catch (error) {
      errors.push({
        profile_id: index + 1,
        status: 'failed',
        error: error.message
      });
    }
  }

  // Update batch status in database
  await supabase
    .from('batch_processing')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      results,
      errors,
      success_count: results.length,
      error_count: errors.length
    })
    .eq('batch_id', batchId);

  // Send callback if provided
  if (callbackUrl) {
    await sendCallback(callbackUrl, {
      batchId,
      status: 'completed',
      results,
      errors
    });
  }
}

/**
 * Send callback to webhook
 */
async function sendCallback(url, data) {
  const fetch = require('node-fetch');
  
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch (error) {
    console.error('Callback failed:', error);
  }
}

// ==================== SECURITY MIDDLEWARE ====================

