import { cleanText, toArray } from "../utils/textProcessors.js";

/**
 * Parser simple de CVs/perfiles (JSON/texto).
 * Si recibís PDF/DOCX deberías extraer texto con otra capa (no incluido acá).
 */
export function parseProfile(payload = {}) {
  // payload.profile se espera en tus ejemplos
  const profile = payload.profile ?? payload;

  const nombre = profile.nombre ?? profile.name ?? "";
  const descripcion = cleanText(profile.descripcion ?? profile.summary ?? "");
  const experienciaOilGas = cleanText(profile.experienciaOilGas ?? profile.oilGasExperience ?? "");
  const habilidades = toArray(profile.habilidades ?? profile.skills ?? []);

  return {
    nombre: cleanText(nombre),
    descripcion,
    experienciaOilGas,
    habilidades,
    raw: profile,
  };
}
