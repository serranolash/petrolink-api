const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Validate API Key Middleware
 */
async function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  
  if (!apiKey) {
    return res.status(401).json({
      error: 'API key required',
      code: 'API_KEY_MISSING'
    });
  }

  try {
    // Check API key in database
    const { data, error } = await supabase
      .from('api_keys')
      .select('client_id, name, rate_limit, is_active, permissions')
      .eq('key_hash', hashApiKey(apiKey))
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return res.status(401).json({
        error: 'Invalid API key',
        code: 'API_KEY_INVALID'
      });
    }

    // Attach client info to request
    req.clientId = data.client_id;
    req.clientName = data.name;
    req.apiKey = apiKey;
    req.rateLimit = data.rate_limit;
    req.permissions = data.permissions || [];
    
    // Check rate limit from Redis (simplified)
    const isRateLimited = await checkRateLimit(req.clientId);
    if (isRateLimited) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: '15 minutes'
      });
    }

    next();
  } catch (error) {
    console.error('API key validation error:', error);
    res.status(500).json({
      error: 'Authentication service unavailable',
      code: 'AUTH_SERVICE_ERROR'
    });
  }
}

/**
 * Log all API requests
 */
async function logRequest(req, res, next) {
  const requestId = uuidv4();
  req.requestId = requestId;
  
  const logEntry = {
    request_id: requestId,
    client_id: req.clientId,
    method: req.method,
    path: req.path,
    query: req.query,
    user_agent: req.get('user-agent'),
    ip_address: req.ip,
    timestamp: new Date().toISOString()
  };

  // Async log to database
  supabase
    .from('api_request_logs')
    .insert(logEntry)
    .then(() => console.debug(`Request logged: ${requestId}`))
    .catch(err => console.error('Logging failed:', err));

  next();
}

function hashApiKey(apiKey) {
  const crypto = require('crypto');
  return crypto
    .createHash('sha256')
    .update(apiKey + process.env.API_KEY_SALT)
    .digest('hex');
}

async function checkRateLimit(clientId) {
  // Implement Redis-based rate limiting
  // For now, return false (not rate limited)
  return false;
}

const { v4: uuidv4 } = require('uuid');

module.exports = {
  validateApiKey,
  logRequest,
};


