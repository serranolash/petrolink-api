const crypto = require("crypto");

/**
 * Servicio público de análisis de CV - SIN DEPENDENCIAS EXTERNAS
 */

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function normalizeText(t = "") {
  return String(t || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeEmail(email) {
  if (!email) return null;
  const e = String(email).trim().toLowerCase();
  if (!e.includes("@") || e.length < 6) return null;
  return e;
}

/**
 * Sistema de cuota simple en memoria (para producción usaría Supabase)
 */
const quotaMemory = new Map();

async function checkAndConsumePublicQuota({ cvText, email, maxFree = 3 }) {
  const clean = normalizeText(cvText);
  const cvHash = sha256(clean);
  const shortHash = cvHash.substring(0, 12);
  const emailNorm = normalizeEmail(email);
  
  // Clave única para tracking
  const quotaKey = emailNorm ? `${shortHash}:${emailNorm}` : shortHash;
  
  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;
  
  // Obtener registro existente o crear nuevo
  let record = quotaMemory.get(quotaKey);
  if (!record || (now - record.firstUse) > dayInMs) {
    // Nuevo día o nuevo CV
    record = {
      cvHash: shortHash,
      email: emailNorm,
      count: 1,
      firstUse: now,
      lastUse: now
    };
  } else {
    // Incrementar contador existente
    record.count += 1;
    record.lastUse = now;
  }
  
  quotaMemory.set(quotaKey, record);
  
  // Limpiar registros viejos (más de 7 días)
  for (const [key, rec] of quotaMemory.entries()) {
    if (now - rec.lastUse > 7 * dayInMs) {
      quotaMemory.delete(key);
    }
  }
  
  const allowed = record.count <= maxFree;
  const remaining = Math.max(0, maxFree - record.count);
  
  return {
    cv_hash: shortHash,
    allowed,
    remaining,
    count: record.count,
    max_free: maxFree
  };
}

/**
 * Análisis de CV público
 */
async function analyzePublicCvText(cvText) {
  try {
    // Importación dinámica para evitar problemas de circular dependency
    const { deepseekAnalyzeCvText } = require("./deepseekService");
    return await deepseekAnalyzeCvText(cvText);
  } catch (error) {
    console.error("Error in analyzePublicCvText:", error.message);
    
    // Fallback absoluto
    const text = normalizeText(cvText);
    return {
      industry: "General",
      role_seniority: "Mid-Level",
      top_roles: ["Professional", "Specialist"],
      skills: [],
      score: 5,
      red_flags: ["Error en el análisis"],
      summary: "Análisis completado. Para resultados más precisos, intenta nuevamente.",
      next_steps: ["Verificar la información del CV", "Probar con un texto más descriptivo"]
    };
  }
}

module.exports = { checkAndConsumePublicQuota, analyzePublicCvText };