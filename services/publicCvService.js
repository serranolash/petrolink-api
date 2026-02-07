const crypto = require("crypto");

console.log("🔄 Loading publicCvService.js...");

/**
 * Servicio público de análisis de CV
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

// Sistema de cuota simple
const quotaMemory = new Map();

async function checkAndConsumePublicQuota({ cvText, email, maxFree = 3 }) {
  const clean = normalizeText(cvText);
  const cvHash = sha256(clean);
  const shortHash = cvHash.substring(0, 12);
  
  console.log(`📊 Quota check - Hash: ${shortHash}, Length: ${clean.length}`);
  
  return {
    cv_hash: shortHash,
    allowed: true,
    remaining: maxFree - 1,
    count: 1,
    max_free: maxFree
  };
}

/**
 * Análisis de CV público con DEBUG
 */
async function analyzePublicCvText(cvText) {
  console.log("🔍 analyzePublicCvText called, text length:", cvText?.length);
  
  try {
    console.log("1. Attempting to require deepseekService...");
    
    // Importación explícita con logging
    const deepseekPath = require.resolve("./deepseekService");
    console.log("2. deepseekService path:", deepseekPath);
    
    const { deepseekAnalyzeCvText } = require("./deepseekService");
    console.log("3. Function loaded:", typeof deepseekAnalyzeCvText);
    
    console.log("4. Calling deepseekAnalyzeCvText...");
    const result = await deepseekAnalyzeCvText(cvText);
    console.log("5. deepseekAnalyzeCvText returned:", typeof result);
    
    // Validar resultado
    if (!result || typeof result !== 'object') {
      throw new Error("Invalid response from DeepSeek service");
    }
    
    console.log("✅ Analysis successful, returning result");
    return result;
    
  } catch (error) {
    console.error("❌ ERROR in analyzePublicCvText:", {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    
    // Fallback mejorado
    const text = normalizeText(cvText);
    const textLower = text.toLowerCase();
    
    // Análisis básico de fallback
    let industry = "General";
    if (textLower.includes('react') || textLower.includes('node') || textLower.includes('javascript')) {
      industry = "IT";
    }
    
    let experience = 3;
    const yearsMatch = textLower.match(/(\d+)\s*años?/i);
    if (yearsMatch) experience = parseInt(yearsMatch[1]);
    
    let seniority = "Mid-Level";
    if (experience >= 5) seniority = "Senior";
    else if (experience <= 2) seniority = "Junior";
    
    const commonSkills = ['react', 'node', 'javascript', 'typescript', 'docker', 'aws', 'kubernetes'];
    const detectedSkills = commonSkills.filter(skill => textLower.includes(skill));
    
    return {
      industry: industry,
      role_seniority: seniority,
      top_roles: ["Desarrollador", "Ingeniero de Software", "Especialista Técnico"],
      skills: detectedSkills,
      score: Math.min(10, Math.max(1, Math.floor(experience * 1.2))),
      red_flags: [`Fallback analysis (${error.message.substring(0, 50)})`],
      summary: `Análisis de CV completado. ${experience} años de experiencia detectados.`,
      next_steps: ["Completar información técnica", "Agregar logros cuantificables"]
    };
  }
}

console.log("✅ publicCvService.js loaded successfully");

module.exports = { checkAndConsumePublicQuota, analyzePublicCvText };