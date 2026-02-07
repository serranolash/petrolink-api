console.log("=== 🚨 DEEPSEEK SERVICE STARTING 🚨 ===");
console.log("📅 Timestamp:", new Date().toISOString());
console.log("📍 File:", __filename);

/**
 * Análisis local como fallback
 */
function localCvAnalysis(text) {
  console.log("🔄 Using local analysis fallback");
  
  const textLower = (text || "").toLowerCase();
  
  // Industria
  let industry = "General";
  if (textLower.includes('react') || textLower.includes('node') || textLower.includes('javascript')) {
    industry = "IT";
  } else if (textLower.includes('oil') || textLower.includes('gas')) {
    industry = "Energía";
  }
  
  // Experiencia
  let experience = 3;
  const yearsMatch = textLower.match(/(\d+)\s*(años|years)/);
  if (yearsMatch) experience = parseInt(yearsMatch[1]);
  
  // Seniority
  let seniority = "Mid-Level";
  if (experience >= 5) seniority = "Senior";
  else if (experience <= 2) seniority = "Junior";
  
  // Skills
  const skillsList = ['react', 'node', 'javascript', 'typescript', 'python', 'docker', 
                     'aws', 'kubernetes', 'postgresql', 'mongodb'];
  const detectedSkills = skillsList.filter(skill => textLower.includes(skill));
  
  return {
    industry: industry,
    role_seniority: seniority,
    top_roles: ["Desarrollador Full Stack", "Ingeniero de Software", "Especialista Técnico"],
    skills: detectedSkills.length > 0 ? detectedSkills : ["Habilidades técnicas"],
    score: Math.min(10, Math.max(5, experience)),
    red_flags: text.length < 50 ? ["CV muy breve"] : [],
    summary: `Profesional con ${experience} años de experiencia en ${industry}. Análisis local.`,
    next_steps: ["Para análisis más detallado, completa tu perfil en Petrolink"],
    _source: "local-fallback"
  };
}

/**
 * Servicio DeepSeek - Versión robusta
 */
async function deepseekAnalyzeCvText(inputText) {
  console.log("=== 🤖 DEEPSEEK FUNCTION CALLED 🤖 ===");
  console.log("📝 Input length:", inputText?.length);
  
  // Obtener configuración
  const url = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1/chat/completions";
  const key = process.env.DEEPSEEK_API_KEY;
  
  console.log("🔧 Config check:", {
    hasUrl: !!url,
    hasKey: !!key,
    keyLength: key?.length,
    urlPreview: url.replace(/https?:\/\/[^\/]+/, 'https://***')
  });
  
  // Si no hay key, usar análisis local inmediatamente
  if (!key || key.trim().length < 10) {
    console.log("⚠️ No valid API key, using local analysis");
    return localCvAnalysis(inputText);
  }
  
  try {
    console.log("🚀 Attempting DeepSeek API call...");
    
    const payload = {
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "You are a CV analyst. Return ONLY valid JSON, no other text. Format: {industry: string, role_seniority: string, top_roles: array, skills: array, score: number, red_flags: array, summary: string, next_steps: array}"
        },
        {
          role: "user",
          content: `Analyze this CV: ${inputText.substring(0, 1000)}`
        }
      ],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: "json_object" }
    };
    
    console.log("📤 Sending request to DeepSeek...");
    
    // Usar fetch global (Node.js 18+)
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify(payload)
    });
    
    console.log("📥 Response status:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ API Error:", response.status, errorText.substring(0, 200));
      throw new Error(`API Error ${response.status}`);
    }
    
    const data = await response.json();
    console.log("✅ API Response received");
    
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response content");
    }
    
    // Parse JSON
    try {
      const result = JSON.parse(content);
      console.log("📊 Successfully parsed JSON response");
      return { ...result, _source: "deepseek" };
    } catch (parseError) {
      console.error("❌ JSON Parse error:", parseError.message);
      // Intentar extraer JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error("No valid JSON found");
    }
    
  } catch (error) {
    console.error("💥 DeepSeek API call failed:", error.message);
    console.error("Stack:", error.stack);
    
    // Fallback a análisis local
    return localCvAnalysis(inputText);
  }
}

console.log("=== ✅ DEEPSEEK SERVICE LOADED ✅ ===");
console.log("Function exported:", typeof deepseekAnalyzeCvText);

module.exports = { deepseekAnalyzeCvText };