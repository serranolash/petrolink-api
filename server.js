require("dotenv").config();
const express = require("express");
const cors = require("cors");

const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const swaggerDocument = YAML.load("./docs/openapi.yaml");

const { validateApiKey, logRequest } = require("./middleware/security.js");
const { rateLimit } = require("./middleware/rateLimit.js");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

// ✅ Docs (sin auth)
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// ✅ Health (sin auth)
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "petrolink-api", ts: new Date().toISOString() });
});

const { checkAndConsumePublicQuota, analyzePublicCvText } = require("./services/publicCvService");

// Rate-limit público (más bajo)
app.use("/v1/public", rateLimit({ windowMs: 60_000, max: 30 }));

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

    // 1) cuota gratis
    const quota = await checkAndConsumePublicQuota({
      cvText: cv_text,
      email,
      maxFree: 3,
    });

    if (!quota.allowed) {
      return res.status(429).json({
        ok: false,
        code: "PUBLIC_LIMIT_REACHED",
        message: "Alcanzaste el límite gratuito para este CV.",
        remaining: 0,
        cta: {
          message: "Registrate en Petrolink para análisis completos y seguimiento",
          url: "https://www.petrolinkvzla.com",
        },
      });
    }

    // 2) análisis
    const analysis = analyzePublicCvText(cv_text);

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
    console.error("public analyze cv-text error:", err);
    return res.status(500).json({
      ok: false,
      code: "PUBLIC_ANALYZE_ERROR",
      message: "Error procesando el CV.",
    });
  }
});


// 🔐 Seguridad real (Supabase) + logging
app.use("/v1", validateApiKey, logRequest);

// (Opcional) Rate limit adicional
if (typeof rateLimit === "function") {
  app.use("/v1", rateLimit({ windowMs: 60_000, max: 60 }));
}

// Endpoints MVP
app.post("/v1/analyze/profile", async (req, res) => {
  try {
    return res.json({
      ok: true,
      request_id: req.requestId,
      client: { id: req.clientId, name: req.clientName },
      profile: req.body?.profile ?? req.body,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Internal Server Error",
      detail: String(err?.message || err),
    });
  }
});

app.get("/v1/search", async (req, res) => {
  return res.json({
    ok: true,
    request_id: req.requestId,
    client: { id: req.clientId, name: req.clientName },
    query: req.query,
    results: [],
  });
});

app.listen(PORT, () => {
  console.log(`✅ Petrolink API running on http://localhost:${PORT}`);
  console.log(`📚 Swagger docs: http://localhost:${PORT}/docs`);
});
