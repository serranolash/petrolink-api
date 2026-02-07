require("dotenv").config();

const express = require("express");
const cors = require("cors");

const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const path = require("path");
const fs = require("fs");
const ENABLE_DOCS = process.env.ENABLE_DOCS !== "false";


// Swagger (safe)

if (ENABLE_DOCS) {
let swaggerDocument = null;
try {
  const swaggerPath = path.join(__dirname, "..", "docs", "openapi.yaml"); // ✅ absoluto
  if (fs.existsSync(swaggerPath)) {
    const YAML = require("yamljs");
    swaggerDocument = YAML.load(swaggerPath);
  } else {
    console.warn("⚠️ Swagger file not found:", swaggerPath);
  }
} catch (e) {
  console.error("⚠️ Swagger load failed:", e);
  swaggerDocument = null;
}

if (swaggerDocument) {
  const swaggerUi = require("swagger-ui-express");
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} else {
  app.get("/docs", (req, res) => res.status(200).send("Docs not available."));
}

} else {
    app.get("/docs", (req, res) => res.status(404).send("Docs disabled"));
  }

const { validateApiKey, logRequest } = require("../middleware/security.js");
const { rateLimit } = require("../middleware/rateLimit.js");
const { checkAndConsumePublicQuota, analyzePublicCvText } = require("../services/publicCvService.js");

const app = express();

app.get("/", (req, res) => {
    res.json({ ok: true, service: "petrolink-api", docs: "/docs", health: "/health" });
  });
  

app.use(cors({ origin: "*", credentials: false }));
app.use(express.json({ limit: "5mb" }));

// docs
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));


// health
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "petrolink-api", ts: new Date().toISOString() });
});

// public rate limit
app.use("/v1/public", rateLimit({ windowMs: 60_000, max: 30 }));

// ✅ public analyze
app.post("/v1/public/analyze/cv-text", async (req, res) => {
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

    const quota = await checkAndConsumePublicQuota({ cvText: cv_text, email, maxFree: 3 });
    if (!quota.allowed) {
      return res.status(429).json({
        ok: false,
        code: "PUBLIC_LIMIT_REACHED",
        message: "Alcanzaste el límite gratuito para este CV.",
        remaining: 0,
        cta: { message: "Registrate en Petrolink", url: "https://www.petrolinkvzla.com" },
      });
    }

    const analysis = await analyzePublicCvText(cv_text);

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
    console.error("public analyze error:", err);
    return res.status(500).json({
      ok: false,
      code: "PUBLIC_ANALYZE_ERROR",
      message: "Error procesando el CV.",
    });
  }
});

// 🔐 protected routes
app.use("/v1", validateApiKey, logRequest);

// ejemplo protegido
app.get("/v1/search", (req, res) => {
  res.json({
    ok: true,
    request_id: req.requestId,
    client: { id: req.clientId, name: req.clientName },
    results: []
  });
});

module.exports = app;
