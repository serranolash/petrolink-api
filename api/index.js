require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

// CORREGIDO: Usa path.join para rutas correctas
const { validateApiKey, logRequest } = require(path.join(__dirname, "../middleware/security.js"));
const { rateLimit } = require(path.join(__dirname, "../middleware/rateLimit.js"));
const { checkAndConsumePublicQuota, analyzePublicCvText } = require(path.join(__dirname, "../services/publicCvService.js"));

const app = express();

app.use(cors({ origin: "*", credentials: false }));
app.use(express.json({ limit: "5mb" }));

// Root + health (siempre arriba)
app.get("/", (req, res) => {
  res.json({ ok: true, service: "petrolink-api", docs: "/docs", health: "/health" });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "petrolink-api", ts: new Date().toISOString() });
});

// --------------------
// Swagger (NO CRASH)
// --------------------
const ENABLE_DOCS = process.env.ENABLE_DOCS !== "false";

if (ENABLE_DOCS) {
  try {
    const swaggerPath = path.join(__dirname, "..", "docs", "openapi.yaml");
    if (fs.existsSync(swaggerPath)) {
      const swaggerUi = require("swagger-ui-express");
      const YAML = require("yamljs");
      const swaggerDocument = YAML.load(swaggerPath);

      app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    } else {
      console.warn("⚠️ Swagger file not found:", swaggerPath);
      app.get("/docs", (req, res) => res.status(200).send("Docs not available (missing openapi.yaml)."));
    }
  } catch (e) {
    console.error("⚠️ Swagger load failed:", e);
    app.get("/docs", (req, res) => res.status(200).send("Docs not available (swagger failed)."));
  }
} else {
  app.get("/docs", (req, res) => res.status(404).send("Docs disabled"));
}

// --------------------
// Public endpoints
// --------------------
app.use("/v1/public", rateLimit({ windowMs: 60_000, max: 30 }));

app.post("/v1/public/analyze/cv-text", async (req, res) => {
  console.log("=== ANALYZE CV REQUEST ===");
  console.log("Body received:", JSON.stringify(req.body));
  
  try {
    const cv_text = req.body?.cv_text;
    const email = req.body?.email;

    if (!cv_text || String(cv_text).trim().length < 50) {
      return res.status(400).json({
        ok: false,
        code: "CV_TEXT_REQUIRED",
        message: "Debés enviar cv_text (mínimo 50 caracteres).",
      });
    }

    console.log("Checking quota...");
    const quota = await checkAndConsumePublicQuota({ cvText: cv_text, email, maxFree: 3 });
    console.log("Quota result:", quota);
    
    if (!quota.allowed) {
      return res.status(429).json({
        ok: false,
        code: "PUBLIC_LIMIT_REACHED",
        message: "Alcanzaste el límite gratuito para este CV.",
        remaining: 0,
        cta: { message: "Registrate en Petrolink", url: "https://www.petrolinkvzla.com" },
      });
    }

    console.log("Analyzing CV text...");
    const analysis = await analyzePublicCvText(cv_text);
    console.log("Analysis complete");

    return res.json({
      ok: true,
      remaining: quota.remaining,
      analysis,
      cta: {
        message: "Registrate en Petrolink para posicionarte y estar en el radar de operadoras",
        url: "https://www.petrolinkvzla.com",
      },
    });
  } catch (err) {
    console.error("public analyze error DETAILS:", {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    return res.status(500).json({
      ok: false,
      code: "PUBLIC_ANALYZE_ERROR",
      message: "Error procesando el CV.",
      debug: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// --------------------
// Protected endpoints
// --------------------
app.use("/v1", validateApiKey, logRequest);

app.get("/v1/search", (req, res) => {
  res.json({
    ok: true,
    request_id: req.requestId,
    client: { id: req.clientId, name: req.clientName },
    results: [],
  });
});

// Endpoint de diagnóstico
app.get("/debug", (req, res) => {
  const fs = require("fs");
  const path = require("path");
  
  const files = {
    security: fs.existsSync(path.join(__dirname, "../middleware/security.js")),
    rateLimit: fs.existsSync(path.join(__dirname, "../middleware/rateLimit.js")),
    publicCvService: fs.existsSync(path.join(__dirname, "../services/publicCvService.js")),
    supabase: fs.existsSync(path.join(__dirname, "../services/supabase.js")),
    deepseekService: fs.existsSync(path.join(__dirname, "../services/deepseekService.js"))
  };
  
  res.json({
    ok: true,
    node_version: process.version,
    dir: __dirname,
    files,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      DEEPSEEK_API_KEY: !!process.env.DEEPSEEK_API_KEY
    }
  });
});

// Error handler global (último)
app.use((err, req, res, next) => {
  console.error("UNHANDLED ERROR:", err);
  res.status(500).json({ 
    ok: false, 
    code: "UNHANDLED_ERROR", 
    message: "Internal Server Error",
    error: err.message 
  });
});


// Agrega esto para debug
app.get('/diagnostic', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  
  const files = [
    '../utils/textProcessors.js',
    '../services/cvParser.js',
    '../services/aiService.js',
    '../services/deepseekService.js',
    '../services/publicCvService.js'
  ];
  
  const results = files.map(filePath => {
    const fullPath = path.join(__dirname, filePath);
    const exists = fs.existsSync(fullPath);
    
    let syntaxOk = false;
    let moduleType = 'unknown';
    
    if (exists) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        syntaxOk = true;
        
        if (content.includes('export ') && content.includes('import ')) {
          moduleType = 'ESM';
        } else if (content.includes('module.exports') || content.includes('require(')) {
          moduleType = 'CommonJS';
        }
      } catch (err) {
        syntaxOk = false;
      }
    }
    
    return {
      file: filePath,
      exists,
      syntaxOk,
      moduleType
    };
  });
  
  res.json({
    nodeVersion: process.version,
    files: results,
    timestamp: new Date().toISOString()
  });
});
module.exports = app;