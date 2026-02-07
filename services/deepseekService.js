const fetch = require('node-fetch');

async function deepseekAnalyzeCvText(inputText) {
    const url = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1/chat/completions";
    const key = process.env.DEEPSEEK_API_KEY;
  
    // Si no hay API key, usar fallback inmediatamente
    if (!key) {
        console.warn("⚠️ Missing DEEPSEEK_API_KEY, using fallback analysis");
        return getFallbackAnalysis(inputText);
    }
  
    const body = {
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      messages: [
        {
          role: "system",
          content:
            "Sos un analista senior de talento. Respondé únicamente con JSON válido y NADA más. " +
            "No uses markdown. No agregues texto fuera del JSON."
        },
        {
          role: "user",
          content: inputText
        }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    };
  
    try {
        console.log("Calling DeepSeek API...");
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`
          },
          body: JSON.stringify(body)
        });
      
        const rawText = await resp.text();
        
        if (!resp.ok) {
          console.error(`DeepSeek API error ${resp.status}:`, rawText.substring(0, 200));
          return getFallbackAnalysis(inputText);
        }
      
        let data;
        try {
          data = JSON.parse(rawText);
        } catch {
          console.error("DeepSeek returned non-JSON response");
          return getFallbackAnalysis(inputText);
        }
      
        const content = data?.choices?.[0]?.message?.content;
        if (!content) {
            console.error("DeepSeek returned empty content");
            return getFallbackAnalysis(inputText);
        }
      
        // 1) parse directo
        try {
          const result = JSON.parse(content);
          console.log("DeepSeek analysis successful");
          return result;
        } catch {
          // 2) fallback: extraer primer bloque JSON { ... }
          const m = String(content).match(/\{[\s\S]*\}/);
          if (!m) {
              console.error("No JSON found in DeepSeek response");
              return getFallbackAnalysis(inputText);
          }
          return JSON.parse(m[0]);
        }
    } catch (error) {
        console.error("DeepSeek network error:", error.message);
        return getFallbackAnalysis(inputText);
    }
}

// Función de fallback si DeepSeek falla
function getFallbackAnalysis(text) {
    const textLower = text.toLowerCase();
    
    // Análisis básico
    return {
        industry: textLower.includes('react') || textLower.includes('node') ? "IT" : "General",
        role_seniority: "Mid-Level",
        top_roles: ["Desarrollador Full Stack", "Desarrollador Backend"],
        skills: ["JavaScript", "Node.js", "React"].filter(skill => textLower.includes(skill.toLowerCase())),
        score: 7,
        red_flags: [],
        summary: "CV analizado con éxito. Para un análisis más detallado, registrate en Petrolink.",
        next_steps: ["Completar información de experiencia", "Agregar proyectos específicos"]
    };
}
  
module.exports = { deepseekAnalyzeCvText };