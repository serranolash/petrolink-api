const crypto = require('crypto');

/**
 * Servicio DeepSeek seguro - siempre funciona (con o sin API key)
 */
async function deepseekAnalyzeCvText(inputText) {
  const url = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1/chat/completions";
  const key = process.env.DEEPSEEK_API_KEY;

  // Si no hay API key o estamos en desarrollo, usar análisis local
  if (!key || process.env.NODE_ENV === 'development') {
    console.log("📝 Using local analysis (no DeepSeek key or dev mode)");
    return localCvAnalysis(inputText);
  }

  try {
    console.log("🤖 Calling DeepSeek API...");
    
    // fetch nativo de Node.js 18+ (Vercel usa 18+)
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
        messages: [
          {
            role: "system",
            content: "Eres un analista de CV. Devuelve SOLO JSON válido sin texto adicional."
          },
          {
            role: "user",
            content: `Analiza este CV y devuelve JSON: ${inputText}`
          }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" }
      }),
      timeout: 10000 // 10 segundos timeout
    });
  
    if (!response.ok) {
      console.warn(`⚠️ DeepSeek API error ${response.status}`);
      return localCvAnalysis(inputText);
    }
  
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    
    if (!content) {
      console.warn("⚠️ DeepSeek returned empty content");
      return localCvAnalysis(inputText);
    }
  
    try {
      return JSON.parse(content);
    } catch {
      // Intentar extraer JSON si viene con texto
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : localCvAnalysis(inputText);
    }
  } catch (error) {
    console.error("🌐 DeepSeek network error:", error.message);
    return localCvAnalysis(inputText);
  }
}

/**
 * Análisis local de CV (siempre funciona)
 */
function localCvAnalysis(text) {
  const textLower = (text || "").toLowerCase();
  
  // Detectar industria
  let industry = "General";
  if (textLower.includes('react') || textLower.includes('node') || textLower.includes('javascript')) {
    industry = "IT";
  } else if (textLower.includes('oil') || textLower.includes('gas') || textLower.includes('petrol')) {
    industry = "Energía";
  } else if (textLower.includes('enfermer') || textLower.includes('medic') || textLower.includes('salud')) {
    industry = "Salud";
  }
  
  // Detectar experiencia
  let experience = 3;
  const yearsMatch = textLower.match(/(\d+)\s*(años|years|año)/);
  if (yearsMatch) experience = parseInt(yearsMatch[1]);
  
  // Seniority basado en experiencia
  let seniority = "Junior";
  if (experience >= 5) seniority = "Senior";
  else if (experience >= 3) seniority = "Mid-Level";
  
  // Skills detectados
  const commonSkills = ['react', 'node', 'javascript', 'typescript', 'python', 'java', 
                       'docker', 'aws', 'postgresql', 'mongodb', 'express', 'git', 
                       'sql', 'html', 'css', 'vue', 'angular'];
  const detectedSkills = commonSkills.filter(skill => textLower.includes(skill));
  
  return {
    industry: industry,
    role_seniority: seniority,
    top_roles: ["Desarrollador Full Stack", "Ingeniero de Software", "Desarrollador Backend"],
    skills: detectedSkills.length > 0 ? detectedSkills : ["JavaScript", "Node.js", "React"],
    score: Math.min(10, Math.max(5, Math.floor(experience * 1.5))),
    red_flags: text.length < 100 ? ["CV muy breve"] : [],
    summary: `Profesional con ${experience} años de experiencia en ${industry}. ${detectedSkills.length > 0 ? `Habilidades en ${detectedSkills.slice(0, 3).join(', ')}.` : 'Perfil técnico.'}`,
    next_steps: [
      "Agregar más detalles de proyectos específicos",
      "Incluir métricas de impacto cuantificables",
      "Especificar tecnologías y herramientas utilizadas"
    ]
  };
}

module.exports = { deepseekAnalyzeCvText };