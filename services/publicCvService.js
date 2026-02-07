const crypto = require("crypto");
const { supabase } = require("./supabase");
const { deepseekAnalyzeCvText } = require("./deepseekService");

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

  // Asegura hash estable y evita que cambios mínimos rompan el límite
  const cv_hash = sha256(clean);

  const emailNorm = normalizeEmail(email);

  // Buscar registro existente
  const { data: existing, error: selErr } = await supabase
    .from("public_cv_limits")
    .select("id, cv_hash, analysis_count, email")
    .eq("cv_hash", cv_hash)
    .maybeSingle();

  if (selErr) throw selErr;

  // Nuevo CV hash: primera vez
  if (!existing) {
    const { error: insErr } = await supabase.from("public_cv_limits").insert({
      cv_hash,
      email: emailNorm,
      analysis_count: 1,
      last_analysis: new Date().toISOString(),
    });
    if (insErr) throw insErr;

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

  if (updErr) throw updErr;

  return { cv_hash, remaining: Math.max(0, maxFree - nextCount), allowed: true };
}

/* ------------------------- AI Analysis (Multi-industry) ------------------------- */
/**
 * Análisis público (resumen) para CUALQUIER industria/rol.
 * Delegado 100% a DeepSeek, con prompt enfocado a resultados estructurados.
 *
 * Importante: este endpoint es "public demo":
 * - NO devuelve un análisis ultra profundo
 * - Devuelve lo suficiente para enganchar y mandar al Hub
 */
async function analyzePublicCvText(cvText) {
  const clean = normalizeText(cvText);

  // Prompt genérico multi-industria.
  // (Tu deepseekService ya obliga JSON; igual le damos formato y constraints)
  const instruction = `
Analizá el siguiente CV (texto) y devolvé SOLO JSON válido con este formato exacto:

{
  "industry": "string",                  // industria principal (ej: IT, Salud, Educación, Finanzas, Energía, Logística, Retail, Legal, etc.)
  "role_seniority": "string",            // ej: Junior / Semi Senior / Senior / Lead / Manager / Director
  "top_roles": ["string"],               // max 5 roles sugeridos según experiencia
  "skills": ["string"],                  // max 30 skills (sin duplicados)
  "score": number,                       // 1..10 (empleabilidad/consistencia del CV)
  "red_flags": ["string"],               // max 8 (inconsistencias, faltantes)
  "summary": "string",                   // 2-4 líneas, claro y accionable
  "next_steps": ["string"]               // max 6 recomendaciones concretas para mejorar el CV
}

Reglas:
- Respondé SIEMPRE en español.
- No asumas industria: detectala desde el texto.
- No inventes certificaciones; si no están, no las agregues.
- Si faltan datos, ponelo en red_flags/next_steps.
- No agregues texto fuera del JSON.
`;

  // Reusamos tu DeepSeek pero pasándole un texto “enmarcado”
  // para guiar el output. Si tu deepseekService ya arma prompt propio,
  // podés concatenar instruction + CV y listo.
  const payloadText = `${instruction}\n\nCV:\n"""${clean}"""`;

  const analysis = await deepseekAnalyzeCvText(payloadText);

  // Normalización/aseguramiento por si el modelo se sale un poco:
  const out = {
    industry: typeof analysis.industry === "string" ? analysis.industry : "General",
    role_seniority:
      typeof analysis.role_seniority === "string" ? analysis.role_seniority : "No determinado",
    top_roles: Array.isArray(analysis.top_roles) ? analysis.top_roles.map(String).slice(0, 5) : [],
    skills: Array.isArray(analysis.skills)
      ? Array.from(new Set(analysis.skills.map((s) => String(s).trim()).filter(Boolean))).slice(0, 30)
      : [],
    score: typeof analysis.score === "number" ? Math.max(1, Math.min(10, analysis.score)) : 5,
    red_flags: Array.isArray(analysis.red_flags)
      ? analysis.red_flags.map(String).slice(0, 8)
      : [],
    summary: typeof analysis.summary === "string" ? analysis.summary : "",
    next_steps: Array.isArray(analysis.next_steps)
      ? analysis.next_steps.map(String).slice(0, 6)
      : [],
  };

  return out;
}

module.exports = { checkAndConsumePublicQuota, analyzePublicCvText };
