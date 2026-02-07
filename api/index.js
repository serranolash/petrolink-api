require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

// Importaciones seguras
let validateApiKey, logRequest, rateLimit, publicCvService;
try {
  validateApiKey = require("../middleware/security.js").validateApiKey;
  logRequest = require("../middleware/security.js").logRequest;
} catch { /* middleware opcional */ }

try {
  rateLimit = require("../middleware/rateLimit.js").rateLimit;
} catch { 
  rateLimit = () => (req, res, next) => next(); // middleware vacío
}

try {
  publicCvService = require("../services/publicCvService.js");
} catch (error) {
  console.error("❌ Error loading publicCvService:", error.message);
  // Funciones de emergencia
  publicCvService = {
    checkAndConsumePublicQuota: () => ({ allowed: true, remaining: 2 }),
    analyzePublicCvText: () => ({
      industry: "IT",
      role_seniority: "Senior",
      top_roles: ["Developer"],
      skills: [],
      score: 7,
      red_flags: [],
      summary: "Service temporarily unavailable",
      next_steps: ["Try again later"]
    })
  };
}

const app = express();

app.use(cors({ origin: "*", credentials: false }));
// Al inicio, después de app.use(cors(...))
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});
app.use(express.json({ limit: "5mb" }));

// ========== ENDPOINTS PÚBLICOS ==========

// Health check
app.get("/", (req, res) => {
  res.json({ 
    ok: true, 
    service: "petrolink-api", 
    version: "1.0.0",
    endpoints: {
      health: "/health",
      analyze: "/v1/public/analyze/cv-text",
      docs: "/docs"
    }
  });
});

app.get("/health", (req, res) => {
  res.json({ 
    ok: true, 
    service: "petrolink-api", 
    timestamp: new Date().toISOString(),
    node: process.version,
    env: process.env.NODE_ENV || "production"
  });
});

// Endpoint principal CORREGIDO
app.post("/v1/public/analyze/cv-text", async (req, res) => {
  console.log("📨 CV analysis request received");
  
  try {
    const { cv_text, email } = req.body || {};
    
    // Validación básica
    if (!cv_text || typeof cv_text !== 'string') {
      return res.status(400).json({
        ok: false,
        code: "CV_TEXT_REQUIRED",
        message: "El campo 'cv_text' es requerido y debe ser texto."
      });
    }
    
    if (cv_text.trim().length < 30) {
      return res.status(400).json({
        ok: false,
        code: "CV_TEXT_TOO_SHORT",
        message: "El texto del CV debe tener al menos 30 caracteres."
      });
    }
    
    // Check quota (siempre funciona)
    const quota = await publicCvService.checkAndConsumePublicQuota({
      cvText: cv_text,
      email,
      maxFree: 3
    });
    
    if (!quota.allowed) {
      return res.status(429).json({
        ok: false,
        code: "QUOTA_EXCEEDED",
        message: "Has alcanzado el límite gratuito para este CV.",
        remaining: 0,
        reset: "24 horas"
      });
    }
    
    // Análisis del CV (siempre funciona)
    const analysis = await publicCvService.analyzePublicCvText(cv_text);
    
    // Respuesta exitosa
    return res.json({
      ok: true,
      request_id: `req_${Date.now()}`,
      quota: {
        remaining: quota.remaining,
        limit: 3,
        reset: "24h"
      },
      analysis,
      cta: {
        message: "✨ Para análisis más avanzados y oportunidades en Oil & Gas",
        action: "Únete a Petrolink",
        url: "https://www.petrolinkvzla.com"
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("🔥 Error in CV analysis:", error);
    
    // Respuesta de error controlada
    return res.status(500).json({
      ok: false,
      code: "INTERNAL_ERROR",
      message: "Error procesando tu CV. Por favor, intenta nuevamente.",
      request_id: `err_${Date.now()}`,
      timestamp: new Date().toISOString()
    });
  }
});

// ========== ENDPOINTS PROTEGIDOS ==========
if (validateApiKey && logRequest) {
  app.use("/v1", validateApiKey, logRequest);
  
  app.get("/v1/search", (req, res) => {
    res.json({
      ok: true,
      request_id: req.requestId || "unknown",
      client: { id: req.clientId || "public", name: req.clientName || "Guest" },
      results: [],
      message: "Protected endpoint - requires API key"
    });
  });
}

// ========== DOCUMENTACIÓN ==========
app.get("/docs", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Petrolink API Docs</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .endpoint { background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 8px; }
        code { background: #e0e0e0; padding: 2px 6px; border-radius: 4px; }
      </style>
    </head>
    <body>
      <h1>📚 Petrolink API v1.0</h1>
      
      <div class="endpoint">
        <h3>POST /v1/public/analyze/cv-text</h3>
        <p>Analiza un CV de texto y devuelve insights.</p>
        <p><strong>Request:</strong></p>
        <code>
        {
          "cv_text": "Tu texto de CV aquí...",
          "email": "opcional@email.com"
        }
        </code>
      </div>
      
      <p>Para más información: <a href="https://www.petrolinkvzla.com">petrolinkvzla.com</a></p>
    </body>
    </html>
  `);
});

// ========== ERROR HANDLING ==========
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    code: "NOT_FOUND",
    message: `Ruta no encontrada: ${req.path}`,
    available: ["/", "/health", "/docs", "/v1/public/analyze/cv-text"]
  });
});

app.use((error, req, res, next) => {
  console.error("💥 Unhandled error:", error);
  res.status(500).json({
    ok: false,
    code: "SERVER_ERROR",
    message: "Error interno del servidor",
    timestamp: new Date().toISOString()
  });
});

app.get("/env-check", (req, res) => {
  // Obtener todas las variables DeepSeek
  const deepseekVars = {};
  Object.keys(process.env).forEach(key => {
    if (key.includes('DEEPSEEK') || key.includes('SUPABASE')) {
      const value = process.env[key];
      deepseekVars[key] = {
        exists: !!value,
        length: value?.length,
        preview: value ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}` : null
      };
    }
  });
  
  res.json({
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    environment: process.env.NODE_ENV,
    variables: deepseekVars,
    deepseekService: {
      loaded: typeof require !== 'undefined' ? true : false
    }
  });
});

module.exports = app;