if (!process.env.VERCEL) {
  require("dotenv").config();
}


const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");

// Configuración de multer para archivos
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo PDF, DOC, DOCX o TXT.'));
    }
  }
});

// Importaciones seguras
const { validateApiKey, logRequest } = require("../middleware/security.js");
const { rateLimit } = require("../middleware/rateLimit.js");
const { checkAndConsumePublicQuota, analyzePublicCvText } = require("../services/publicCvService.js");

const app = express();

// Middlewares
// index.js - Actualiza CORS
app.use(cors({ 
  origin: "*",  // ← PERMITE TODOS LOS ORÍGENES
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// Manejar preflight OPTIONS
// Preflight OPTIONS se maneja en el middleware de abajo



// O manejar específicamente:
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ========== HELPER FUNCTIONS ==========

/**
 * Extrae texto de diferentes tipos de archivos
 */
async function extractTextFromFile(fileBuffer, mimetype) {
  try {
    if (mimetype === 'application/pdf') {
      const pdfData = await pdfParse(fileBuffer);
      return pdfData.text;
    } else if (mimetype.includes('word') || mimetype.includes('document')) {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return result.value;
    } else if (mimetype === 'text/plain') {
      return fileBuffer.toString('utf8');
    }
    return '';
  } catch (error) {
    console.error("Error extrayendo texto:", error);
    throw new Error(`Error procesando archivo: ${error.message}`);
  }
}

// ========== ENDPOINTS PÚBLICOS ==========

// Health check optimizado
app.get("/", (req, res) => {
  res.json({ 
    ok: true, 
    service: "petrolink-api", 
    version: "2.0.0",
    timestamp: new Date().toISOString(),
    features: {
      text_analysis: "/v1/public/analyze/cv-text",
      file_analysis: "/v1/public/analyze/cv-file",
      file_formats: ["pdf", "doc", "docx", "txt"],
      export: "/v1/public/export/analysis"
    }
  });
});

app.get("/health", (req, res) => {
  res.json({ 
    ok: true, 
    service: "petrolink-api", 
    status: "healthy",
    timestamp: new Date().toISOString(),
    node: process.version
  });
});

// Endpoint para texto - OPTIMIZADO
app.post("/v1/public/analyze/cv-text", 
  rateLimit({ windowMs: 60_000, max: 30 }),
  async (req, res) => {
    console.log("📨 CV text analysis request");
    
    try {
      const { cv_text, email } = req.body || {};
      
      // Validación mejorada
      if (!cv_text || typeof cv_text !== 'string') {
        return res.status(400).json({
          ok: false,
          code: "CV_TEXT_REQUIRED",
          message: "El campo 'cv_text' es requerido y debe ser texto."
        });
      }
      
      const cleanText = cv_text.trim();
      if (cleanText.length < 50) {
        return res.status(400).json({
          ok: false,
          code: "CV_TEXT_TOO_SHORT",
          message: "El texto del CV debe tener al menos 50 caracteres.",
          current_length: cleanText.length
        });
      }
      
      // Check quota
      const quota = await checkAndConsumePublicQuota({
        cvText: cleanText,
        email,
        maxFree: 3
      });
      
      if (!quota.allowed) {
        return res.status(429).json({
          ok: false,
          code: "QUOTA_EXCEEDED",
          message: "Has alcanzado el límite gratuito para este CV.",
          remaining: 0,
          reset_in: "24 horas",
          upgrade_url: "https://www.petrolinkvzla.com/plans"
        });
      }
      
      // Análisis del CV
      const analysis = await analyzePublicCvText(cleanText);
      
      // Generar ID único para exportación
      const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Respuesta optimizada
      return res.json({
        ok: true,
        request_id: `req_${Date.now()}`,
        analysis_id: analysisId,
        quota: {
          remaining: quota.remaining,
          limit: 3,
          reset: "24h"
        },
        analysis: {
          ...analysis,
          text_length: cleanText.length,
          processed_at: new Date().toISOString()
        },
        export: {
          pdf: `${req.protocol}://${req.get('host')}/v1/public/export/analysis/${analysisId}?format=pdf`,
          json: `${req.protocol}://${req.get('host')}/v1/public/export/analysis/${analysisId}?format=json`,
          html: `${req.protocol}://${req.get('host')}/v1/public/export/analysis/${analysisId}?format=html`
        },
        cta: {
          message: "✨ Para análisis completos, seguimiento personalizado y oportunidades exclusivas",
          action: "Únete al Hub de Petrolink",
          url: "https://www.petrolinkvzla.com/register",
          features: [
            "Análisis profundo por IA",
            "Match con oportunidades",
            "Dashboard personalizado",
            "Alertas de empleo"
          ]
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error("Error en análisis de texto:", error);
      return res.status(500).json({
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Error procesando tu CV. Por favor, intenta nuevamente.",
        support_url: "https://www.petrolinkvzla.com/support",
        timestamp: new Date().toISOString()
      });
    }
  }
);

// Nuevo endpoint para archivos
app.post("/v1/public/analyze/cv-file",
  rateLimit({ windowMs: 60_000, max: 15 }),
  upload.single('cv_file'),
  async (req, res) => {
    console.log("📁 CV file analysis request");
    
    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          code: "FILE_REQUIRED",
          message: "Debes subir un archivo (PDF, DOC, DOCX o TXT).",
          max_size: "10MB",
          allowed_types: ["pdf", "doc", "docx", "txt"]
        });
      }
      
      const { email } = req.body || {};
      const file = req.file;
      
      // Extraer texto del archivo
      console.log(`Procesando archivo: ${file.originalname}, tipo: ${file.mimetype}`);
      const extractedText = await extractTextFromFile(file.buffer, file.mimetype);
      
      if (!extractedText || extractedText.trim().length < 50) {
        return res.status(400).json({
          ok: false,
          code: "FILE_CONTENT_INVALID",
          message: "El archivo no contiene suficiente texto válido para análisis.",
          extracted_length: extractedText?.length || 0
        });
      }
      
      // Check quota con hash del texto extraído
      const quota = await checkAndConsumePublicQuota({
        cvText: extractedText,
        email,
        maxFree: 3
      });
      
      if (!quota.allowed) {
        return res.status(429).json({
          ok: false,
          code: "QUOTA_EXCEEDED",
          message: "Has alcanzado el límite gratuito.",
          remaining: 0,
          reset_in: "24 horas"
        });
      }
      
      // Análisis del texto extraído
      const analysis = await analyzePublicCvText(extractedText);
      
      // ID para exportación
      const analysisId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      return res.json({
        ok: true,
        request_id: `file_${Date.now()}`,
        analysis_id: analysisId,
        file_info: {
          name: file.originalname,
          size: file.size,
          type: file.mimetype,
          extracted_length: extractedText.length
        },
        quota: {
          remaining: quota.remaining,
          limit: 3,
          reset: "24h"
        },
        analysis: {
          ...analysis,
          source: "file_upload",
          processed_at: new Date().toISOString()
        },
        export: {
          pdf: `${req.protocol}://${req.get('host')}/v1/public/export/analysis/${analysisId}?format=pdf`,
          json: `${req.protocol}://${req.get('host')}/v1/public/export/analysis/${analysisId}?format=json`
        },
        cta: {
          message: "✨ Archivo analizado exitosamente",
          action: "Ver oportunidades relacionadas",
          url: `https://www.petrolinkvzla.com/opportunities?skills=${encodeURIComponent(analysis.skills.join(','))}`
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error("Error en análisis de archivo:", error);
      
      if (error instanceof multer.MulterError) {
        return res.status(400).json({
          ok: false,
          code: "FILE_UPLOAD_ERROR",
          message: `Error al subir archivo: ${error.message}`,
          max_size: "10MB"
        });
      }
      
      return res.status(500).json({
        ok: false,
        code: "FILE_PROCESSING_ERROR",
        message: `Error procesando archivo: ${error.message}`,
        support_url: "https://www.petrolinkvzla.com/support"
      });
    }
  }
);

// Endpoint para exportar análisis
app.get("/v1/public/export/analysis/:id", (req, res) => {
  const { id } = req.params;
  const { format = 'json' } = req.query;
  
  // En un sistema real, aquí buscarías el análisis de una DB
  // Por ahora, devolvemos un ejemplo
  
  const analysisData = {
    id: id,
    generated_at: new Date().toISOString(),
    analysis: {
      industry: "IT",
      role_seniority: "Senior",
      score: 8,
      skills: ["React", "Node.js", "TypeScript"],
      summary: "Análisis profesional generado por Petrolink AI"
    },
    metadata: {
      service: "Petrolink CV Analyzer",
      version: "2.0.0",
      exported_at: new Date().toISOString()
    }
  };
  
  switch (format.toLowerCase()) {
    case 'pdf':
      // Para PDF necesitarías una librería como pdfkit
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="petrolink-analysis-${id}.pdf"`);
      res.send(`PDF export for ${id} - Implement PDF generation here`);
      break;
      
    case 'html':
      res.setHeader('Content-Type', 'text/html');
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Petrolink Analysis - ${id}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .header { background: #1a365d; color: white; padding: 20px; border-radius: 10px; }
            .section { margin: 20px 0; padding: 15px; border: 1px solid #e2e8f0; border-radius: 8px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📊 Análisis de CV - Petrolink</h1>
            <p>ID: ${id} | Generado: ${new Date().toLocaleDateString()}</p>
          </div>
          <div class="section">
            <h2>Resumen del Análisis</h2>
            <p>${analysisData.analysis.summary}</p>
          </div>
        </body>
        </html>
      `);
      break;
      
    default: // json
      res.json(analysisData);
  }
});

// ========== ENDPOINTS PROTEGIDOS ==========
app.use("/v1/private", validateApiKey, logRequest);

app.get("/v1/private/search", (req, res) => {
  res.json({
    ok: true,
    request_id: req.requestId,
    client: req.clientId,
    results: [],
    pagination: { limit: 20, offset: 0, total: 0 }
  });
});

// 1. Definimos la especificación como una constante (Fuente única de verdad)
const apiSpec = {
  openapi: "3.0.0",
  info: {
    title: "Petrolink CV Analysis API",
    version: "2.0.0",
    description: "API para análisis de CVs con IA para la reinserción laboral en Venezuela y LATAM."
  },
  servers: [
    { url: "https://petrolink-api.vercel.app", description: "Production" },
    { url: "http://localhost:3000", description: "Development" }
  ],
  paths: {
    "/v1/public/analyze/cv-text": {
      post: {
        summary: "Analizar texto de CV",
        tags: ["Público"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  cv_text: { type: "string", minLength: 50, description: "Contenido del CV en texto plano" },
                  email: { type: "string", format: "email", description: "Email para control de cuota" }
                },
                required: ["cv_text", "email"]
              }
            }
          }
        },
        responses: {
          "200": { description: "Análisis completado exitosamente" },
          "429": { description: "Cuota de análisis gratuitos superada" }
        }
      }
    },
    "/v1/public/analyze/cv-file": {
      post: {
        summary: "Analizar archivo de CV (PDF/DOCX)",
        tags: ["Público"],
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  cv_file: { type: "string", format: "binary" },
                  email: { type: "string", format: "email" }
                }
              }
            }
          }
        }
      }
    }
  }
};

// 2. Ruta para el JSON técnico (reemplaza la anterior)
app.get("/api-spec", (req, res) => {
  res.json(apiSpec);
});

// 3. Ruta para la documentación visual de Swagger
const swaggerUi = require('swagger-ui-express');
app.use('/docs', swaggerUi.serve, swaggerUi.setup(apiSpec));

// ========== ERROR HANDLING ==========
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    code: "NOT_FOUND",
    message: `Ruta no encontrada: ${req.path}`,
    available: [
      "/", "/health", "/docs", "/api-spec",
      "/v1/public/analyze/cv-text",
      "/v1/public/analyze/cv-file",
      "/v1/public/export/analysis/:id"
    ],
    timestamp: new Date().toISOString()
  });
});

app.use((error, req, res, next) => {
  console.error("💥 Unhandled error:", error);
  res.status(500).json({
    ok: false,
    code: "SERVER_ERROR",
    message: "Error interno del servidor",
    error_id: `err_${Date.now()}`,
    support_url: "https://www.petrolinkvzla.com/support",
    timestamp: new Date().toISOString()
  });
});

module.exports = app;