const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

console.log("🔄 Loading publicCvService.js...");
console.log("Current dir:", __dirname);
console.log("Files in services dir:", fs.readdirSync(__dirname));

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
 * Análisis de CV público - VERSIÓN VERCEL COMPATIBLE
 */
async function analyzePublicCvText(cvText) {
  console.log("🔍 analyzePublicCvText called, text length:", cvText?.length);
  
  try {
    console.log("=== VERCEL DEBUG ===");
    console.log("1. __dirname:", __dirname);
    console.log("2. Process cwd:", process.cwd());
    
    // Intentar múltiples rutas posibles
    const possiblePaths = [
      path.join(__dirname, 'deepseekService.js'),
      path.join(process.cwd(), 'services', 'deepseekService.js'),
      path.join(__dirname, '..', 'services', 'deepseekService.js'),
      './deepseekService.js',
      'deepseekService.js'
    ];
    
    console.log("3. Checking paths:");
    for (const p of possiblePaths) {
      console.log(`   - ${p}: ${fs.existsSync(p) ? 'EXISTS' : 'NOT FOUND'}`);
    }
    
    // Encontrar la ruta correcta
    let deepseekPath;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        deepseekPath = p;
        console.log(`4. Found at: ${deepseekPath}`);
        break;
      }
    }
    
    if (!deepseekPath) {
      throw new Error("deepseekService.js not found in any path");
    }
    
    // Limpiar cache y requerir
    delete require.cache[require.resolve(deepseekPath)];
    const deepseekModule = require(deepseekPath);
    
    console.log("5. Module loaded, keys:", Object.keys(deepseekModule));
    
    if (!deepseekModule.deepseekAnalyzeCvText) {
      throw new Error("deepseekAnalyzeCvText function not exported");
    }
    
    console.log("6. Calling deepseekAnalyzeCvText...");
    const result = await deepseekModule.deepseekAnalyzeCvText(cvText);
    
    console.log("7. Analysis successful");
    return result;
    
  } catch (error) {
    console.error("❌ ERROR in analyzePublicCvText:", {
      message: error.message,
      stack: error.stack
    });
    
    // Fallback robusto
    return getFallbackAnalysis(cvText);
  }
}

/**
 * Análisis de fallback mejorado
 */
function getFallbackAnalysis(text) {
  console.log("🔄 Using fallback analysis");
  
  const textLower = normalizeText(text).toLowerCase();
  
  // Análisis mejorado
  let industry = "General";
  const industryKeywords = {
    "IT": ["react", "node", "javascript", "typescript", "python", "java", "developer", "software"],
    "Energía": ["oil", "gas", "petrol", "energía", "refinación", "pozo"],
    "Finanzas": ["financiero", "banca", "inversión", "contable", "auditor"],
    "Salud": ["enfermer", "médico", "doctor", "salud", "hospital"]
  };
  
  for (const [ind, keywords] of Object.entries(industryKeywords)) {
    if (keywords.some(keyword => textLower.includes(keyword))) {
      industry = ind;
      break;
    }
  }
  
  let experience = 3;
  const yearsMatch = textLower.match(/(\d+)\s*(años|years|año)/i);
  if (yearsMatch) experience = parseInt(yearsMatch[1]);
  
  let seniority = "Mid-Level";
  if (experience >= 5) seniority = "Senior";
  else if (experience <= 2) seniority = "Junior";
  
  const skillKeywords = [
    'react', 'node', 'javascript', 'typescript', 'python', 'java',
    'docker', 'aws', 'kubernetes', 'postgresql', 'mongodb', 'mysql',
    'express', 'vue', 'angular', 'git', 'linux', 'sql'
  ];
  
  const detectedSkills = skillKeywords.filter(skill => textLower.includes(skill));
  
  return {
    industry: industry,
    role_seniority: seniority,
    top_roles: industry === "IT" 
      ? ["Desarrollador Full Stack", "Ingeniero de Software", "Arquitecto de Soluciones"]
      : ["Profesional", "Especialista", "Consultor"],
    skills: detectedSkills.length > 0 ? detectedSkills : ["Habilidades técnicas"],
    score: Math.min(10, Math.max(5, Math.floor(experience * 1.5))),
    red_flags: textLower.length < 100 ? ["CV muy breve - proporciona más detalles"] : [],
    summary: `Análisis local: ${experience} años en ${industry}. ${detectedSkills.length} habilidades detectadas.`,
    next_steps: [
      "Completa tu perfil en Petrolink para análisis más detallado",
      "Incluye métricas y logros específicos",
      "Detalla proyectos y responsabilidades"
    ]
  };
}

console.log("✅ publicCvService.js loaded successfully");

module.exports = { checkAndConsumePublicQuota, analyzePublicCvText };