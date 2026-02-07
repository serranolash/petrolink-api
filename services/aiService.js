import crypto from "crypto";

/**
 * Servicio de IA (MVP).
 * - Modo "mock" (por defecto): genera un análisis heurístico determinístico.
 * - Modo "deepseek": intenta llamar a DEEPSEEK_API_URL con DEEPSEEK_API_KEY (si existe).
 *
 * Nota: Este archivo está pensado para reutilizar concepto de tu Intelligence Hub sin acoplarlo.
 */

function scoreHeuristic(profile) {
  const skills = profile.habilidades || [];
  const text = `${profile.descripcion || ""} ${profile.experienciaOilGas || ""}`.toLowerCase();
  let score = 5;

  if (text.includes("oil") || text.includes("gas") || text.includes("petrol")) score += 2;
  if (skills.some(s => String(s).toLowerCase().includes("hse"))) score += 2;
  if (skills.length >= 5) score += 1;

  return Math.max(1, Math.min(10, score));
}

function hashObject(obj) {
  const stable = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash("sha256").update(stable).digest("hex");
}

export async function analyzeProfileAI(profile) {
  const mode = (process.env.AI_PROVIDER || "mock").toLowerCase();

  if (mode !== "deepseek") {
    const score = scoreHeuristic(profile);
    const skills_enhanced = Array.from(new Set([...(profile.habilidades || [])]));
    return {
      provider: "mock",
      request_id: `req_${Date.now()}`,
      profile_hash: hashObject(profile),
      score,
      skills_enhanced,
      summary: `Perfil evaluado (mock). Score estimado: ${score}/10.`,
      notes: [
        "Este análisis es heurístico (sin IA externa).",
        "Configurá AI_PROVIDER=deepseek para usar el proveedor externo.",
      ],
    };
  }

  // ---- DeepSeek (best-effort) ----
  const url = process.env.DEEPSEEK_API_URL;
  const key = process.env.DEEPSEEK_API_KEY;
  if (!url || !key) {
    return {
      provider: "deepseek",
      error: "Missing DEEPSEEK_API_URL or DEEPSEEK_API_KEY. Falling back to mock.",
      ...(await analyzeProfileAI({ ...profile, _fallback: true })),
    };
  }

  const prompt = `Analiza este perfil y devolveme JSON con: score(1-10), skills_enhanced(array), summary(string), notes(array).
Perfil:
${JSON.stringify(profile, null, 2)}`;

  const body = {
    model: "deepseek-chat",
    messages: [
      { role: "system", content: "Sos un analista de talento para Oil & Gas. Respondé solo JSON válido." },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    return {
      provider: "deepseek",
      error: `DeepSeek error ${resp.status}: ${txt}`,
      ...(await analyzeProfileAI({ ...profile, _fallback: true })),
    };
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content ?? "{}";

  let parsed = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    // Si vino texto con JSON mezclado, intenta extraer primer bloque
    const m = content.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  }

  return {
    provider: "deepseek",
    request_id: `req_${Date.now()}`,
    profile_hash: hashObject(profile),
    ...parsed,
  };
}
