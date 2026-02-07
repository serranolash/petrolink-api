const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

console.log("🔄 Loading publicCvService.js...");
console.log("📁 Current dir:", __dirname);
console.log("📄 Files in services dir:", fs.readdirSync(__dirname));

// ========== FORZAR CARGA DE DEEPSEEK SERVICE ==========
console.log("🔧 Attempting to load deepseekService.js...");

let deepseekAnalyzeCvText;
try {
  // Ruta ABSOLUTA (ya sabemos que existe en /var/task/services/)
  const deepseekPath = path.join(__dirname, 'deepseekService.js');
  console.log("📍 deepseekService.js path:", deepseekPath);
  console.log("✅ File exists:", fs.existsSync(deepseekPath));
  
  // Limpiar cache y requerir
  delete require.cache[require.resolve(deepseekPath)];
  const deepseekModule = require(deepseekPath);
  
  console.log("📦 deepseekModule loaded. Keys:", Object.keys(deepseekModule));
  
  if (deepseekModule.deepseekAnalyzeCvText) {
    deepseekAnalyzeCvText = deepseekModule.deepseekAnalyzeCvText;
    console.log("✅ deepseekAnalyzeCvText function loaded successfully");
  } else {
    console.error("❌ deepseekAnalyzeCvText not found in module");
    throw new Error("Function not exported");
  }
  
} catch (error) {
  console.error("💥 FAILED to load deepseekService.js:", {
    message: error.message,
    stack: error.stack,
    code: error.code
  });
  
  // Función de fallback embebida
  deepseekAnalyzeCvText = function(inputText) {
    console.log("🔄 Using EMBEDDED fallback (deepseekService failed to load)");
    const textLower = (inputText || "").toLowerCase();
    
    let industry = "General";
    if (textLower.includes('react') || textLower.includes('node')) industry = "IT";
    
    let experience = 3;
    const yearsMatch = textLower.match(/(\d+)\s*years?/i);
    if (yearsMatch) experience = parseInt(yearsMatch[1]);
    
    const skills = ['react', 'node', 'javascript', 'typescript', 'docker', 'aws'];
    const detected = skills.filter(s => textLower.includes(s));
    
    return Promise.resolve({
      industry,
      role_seniority: experience >= 5 ? "Senior" : "Mid-Level",
      top_roles: ["Software Developer", "Engineer"],
      skills: detected,
      score: Math.min(10, experience + 3),
      red_flags: ["Service: Embedded fallback (module load failed)"],
      summary: `Embedded analysis: ${experience} years experience.`,
      next_steps: ["Complete profile on Petrolink"],
      _source: "embedded-fallback"
    });
  };
}

console.log("✅ publicCvService.js loaded with deepseek function:", !!deepseekAnalyzeCvText);

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
 * Análisis de CV público - USANDO LA FUNCIÓN CARGADA
 */
async function analyzePublicCvText(cvText) {
  console.log("🔍 analyzePublicCvText called");
  console.log("📏 Text length:", cvText?.length);
  console.log("🔧 deepseekAnalyzeCvText available:", typeof deepseekAnalyzeCvText);
  
  if (!deepseekAnalyzeCvText) {
    console.error("❌ deepseekAnalyzeCvText is not available!");
    return getEmergencyFallback(cvText);
  }
  
  try {
    console.log("🚀 Calling deepseekAnalyzeCvText...");
    const result = await deepseekAnalyzeCvText(cvText);
    
    console.log("✅ Analysis completed. Source:", result._source || "unknown");
    return result;
    
  } catch (error) {
    console.error("💥 Error in analyzePublicCvText:", {
      message: error.message,
      stack: error.stack
    });
    
    return getEmergencyFallback(cvText);
  }
}

/**
 * Fallback de emergencia
 */
function getEmergencyFallback(text) {
  console.log("🚨 EMERGENCY FALLBACK triggered");
  
  const textLower = normalizeText(text).toLowerCase();
  
  return {
    industry: "IT",
    role_seniority: "Mid-Level",
    top_roles: ["Technical Professional"],
    skills: [],
    score: 5,
    red_flags: ["Emergency fallback - service issue"],
    summary: "Analysis service temporarily unavailable.",
    next_steps: ["Try again later or contact support"],
    _source: "emergency-fallback"
  };
}

module.exports = { checkAndConsumePublicQuota, analyzePublicCvText };