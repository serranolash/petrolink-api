/**
 * Utilidades de procesamiento de texto para normalizar CVs y perfiles.
 * Enfocado en:
 * - limpiar espacios
 * - normalizar listas
 * - extraer skills básicos (heurístico)
 */

function cleanText(input = "") {
  if (!input) return "";
  return String(input)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (typeof v === "string") {
    // separadores comunes
    return v.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
  }
  return [String(v)];
}

function uniqueLower(list = []) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const k = String(item).toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(item); }
  }
  return out;
}

// Heurística mínima para extraer skills desde texto
function extractSkillsFromText(text, dictionary = []) {
  const t = (text || "").toLowerCase();
  const found = [];
  for (const skill of dictionary) {
    const s = String(skill).toLowerCase();
    if (s && t.includes(s)) found.push(skill);
  }
  return uniqueLower(found);
}

// ✅ CommonJS exports
module.exports = {
  cleanText,
  toArray,
  uniqueLower,
  extractSkillsFromText
};