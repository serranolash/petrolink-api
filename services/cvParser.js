const { cleanText, toArray } = require("../utils/textProcessors.js");

/**
 * Parser simple de CVs/perfiles (JSON/texto).
 */
function parseProfile(payload = {}) {
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

module.exports = { parseProfile };