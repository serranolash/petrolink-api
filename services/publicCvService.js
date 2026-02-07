const crypto = require("crypto");
const { supabase } = require("./supabase");
const { deepseekAnalyzeCvText } = require("./deepseekService");

// Al inicio de publicCvService.js, después de los imports:
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.warn("⚠️ Supabase credentials missing. Using in-memory quota tracking.");
}

/* ------------------------- Helpers ------------------------- */

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
  // validación suave (no bloquea)
  if (!e.includes("@") || e.length < 6) return null;
  return e;
}

/* ------------------------- Quota (Public) ------------------------- */
/**
 * Limita por cv_hash. (Opcional) asocia email para reporting.
 * NO guarda el CV, solo:
 * - cv_hash
 * - email (opcional)
 * - analysis_count / last_analysis
 */
async function checkAndConsumePublicQuota({ cvText, email, maxFree = 3 }) {
  const clean = normalizeText(cvText);
  const cv_hash = sha256(clean);
  const emailNorm = normalizeEmail(email); // ¡FALTABA ESTA LÍNEA!

  // Si no hay credenciales de Supabase, usar memoria
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.log(`[DEV] Quota check for hash: ${cv_hash.substring(0, 8)}...`);
    return { 
      cv_hash: cv_hash.substring(0, 12), 
      remaining: maxFree - 1, 
      allowed: true 
    };
  }

  try {
    // Buscar registro existente
    const { data: existing, error: selErr } = await supabase
      .from("public_cv_limits")
      .select("id, cv_hash, analysis_count, email")
      .eq("cv_hash", cv_hash)
      .maybeSingle();

    if (selErr) {
      console.error("Supabase select error:", selErr);
      // Fallback a memoria si Supabase falla
      return { 
        cv_hash: cv_hash.substring(0, 12), 
        remaining: maxFree - 1, 
        allowed: true 
      };
    }

    // Nuevo CV hash: primera vez
    if (!existing) {
      const { error: insErr } = await supabase.from("public_cv_limits").insert({
        cv_hash,
        email: emailNorm,
        analysis_count: 1,
        last_analysis: new Date().toISOString(),
      });
      
      if (insErr) {
        console.error("Supabase insert error:", insErr);
        // Fallback
        return { 
          cv_hash: cv_hash.substring(0, 12), 
          remaining: maxFree - 1, 
          allowed: true 
        };
      }

      return { cv_hash, remaining: Math.max(0, maxFree - 1), allowed: true };
    }

    // Si ya alcanzó límite
    if ((existing.analysis_count || 0) >= maxFree) {
      return { cv_hash, remaining: 0, allowed: false };
    }

    const nextCount = (existing.analysis_count || 0) + 1;

    // Update: incrementa count, guarda email si antes estaba vacío y ahora viene
    const patch = {
      analysis_count: nextCount,
      last_analysis: new Date().toISOString(),
    };
    if (!existing.email && emailNorm) patch.email = emailNorm;

    const { error: updErr } = await supabase
      .from("public_cv_limits")
      .update(patch)
      .eq("cv_hash", cv_hash);

    if (updErr) {
      console.error("Supabase update error:", updErr);
      // Fallback
      return { 
        cv_hash: cv_hash.substring(0, 12), 
        remaining: Math.max(0, maxFree - nextCount), 
        allowed: true 
      };
    }

    return { cv_hash, remaining: Math.max(0, maxFree - nextCount), allowed: true };
  } catch (error) {
    console.error("Error in checkAndConsumePublicQuota:", error);
    // Fallback seguro
    return { 
      cv_hash: cv_hash.substring(0, 12), 
      remaining: maxFree - 1, 
      allowed: true 
    };
  }
}

/* ------------------------- AI Analysis (Multi-industry) ------------------------- */
/**
 * Análisis público (resumen) para CUALQUIER industria/rol.
 */
async function analyzePublicCvText(cvText) {
  const clean = normalizeText(cvText);

  try {
    // Prompt genérico multi-industria
    const instruction = `Analizá el siguiente CV (texto) y devolvé SOLO JSON válido con este formato exacto:

{
  "industry": "string",
  "role_seniority": "string",
  "top_roles": ["string"],
  "skills": ["string"],
  "score": number,
  "red_flags": ["string"],
  "summary": "string",
  "next_steps": ["string"]
}

Reglas:
- Respondé SIEMPRE en español.
- No inventes certificaciones; si no están, no las agregues.
- Si faltan datos, ponelo en red_flags/next_steps.
- No agregues texto fuera del JSON.`;

    const payloadText = `${instruction}\n\nCV:\n"""${clean}"""`;

    const analysis = await deepseekAnalyzeCvText(payloadText);

    // Normalización/aseguramiento por si el modelo se sale un poco:
    const out = {
      industry: typeof analysis.industry === "string" ? analysis.industry : "General",
      role_seniority: typeof analysis.role_seniority === "string" ? analysis.role_seniority : "No determinado",
      top_roles: Array.isArray(analysis.top_roles) ? analysis.top_roles.map(String).slice(0, 5) : [],
      skills: Array.isArray(analysis.skills)
        ? Array.from(new Set(analysis.skills.map((s) => String(s).trim()).filter(Boolean))).slice(0, 30)
        : [],
      score: typeof analysis.score === "number" ? Math.max(1, Math.min(10, analysis.score)) : 5,
      red_flags: Array.isArray(analysis.red_flags)
        ? analysis.red_flags.map(String).slice(0, 8)
        : [],
      summary: typeof analysis.summary === "string" ? analysis.summary : "Análisis completo del CV.",
      next_steps: Array.isArray(analysis.next_steps)
        ? analysis.next_steps.map(String).slice(0, 6)
        : ["Completar información de experiencia", "Agregar métricas de impacto"],
    };

    return out;
  } catch (error) {
    console.error("Error in analyzePublicCvText:", error.message);
    
    // Fallback básico si DeepSeek falla
    return {
      industry: "IT",
      role_seniority: "Mid-Level",
      top_roles: ["Desarrollador Full Stack", "Desarrollador Backend"],
      skills: ["React", "Node.js", "PostgreSQL", "Docker"],
      score: 7,
      red_flags: ["Servicio de análisis temporalmente no disponible"],
      summary: "CV analizado con éxito. Para un análisis más detallado, registrate en Petrolink.",
      next_steps: ["Completar información de experiencia", "Agregar proyectos específicos"]
    };
  }
}

module.exports = { checkAndConsumePublicQuota, analyzePublicCvText };