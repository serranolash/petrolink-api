// services/deepseekService.js - VERSIÓN CORREGIDA
async function deepseekAnalyzeCvText(inputText) {
  // 1. Obtener variables de TODAS las formas posibles
  const url = process.env.DEEPSEEK_API_URL || 
              process.env.NEXT_PUBLIC_DEEPSEEK_API_URL || 
              "https://api.deepseek.com/v1/chat/completions";
  
  const key = process.env.DEEPSEEK_API_KEY || 
              process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY;
  
  console.log("🔧 DeepSeek Config:", {
    url: url.replace(/https?:\/\/[^\/]+/, 'https://***'), // Ocultar dominio
    hasKey: !!key,
    keyLength: key?.length,
    envKeys: Object.keys(process.env).join(', ')
  });

  // 2. Validación robusta de API key
  if (!key || key.trim().length < 20) {
    console.warn("⚠️ Invalid or missing DeepSeek API key. Using local analysis.");
    return localCvAnalysis(inputText);
  }

  // 3. Llamada a API con mejor manejo de errores
  try {
    console.log("🚀 Calling DeepSeek API...");
    
    const payload = {
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      messages: [
        {
          role: "system",
          content: `Eres un analista de CV experto. Analiza el siguiente CV y devuelve SOLO un objeto JSON con: 
          {
            "industry": "string (industria principal)",
            "role_seniority": "string (Junior/Mid/Senior/Lead)",
            "top_roles": ["array", "de", "roles", "sugeridos"],
            "skills": ["array", "de", "habilidades", "detectadas"],
            "score": number (1-10),
            "red_flags": ["array", "de", "problemas"],
            "summary": "string (resumen en español)",
            "next_steps": ["array", "de", "recomendaciones"]
          }
          No agregues texto fuera del JSON.`
        },
        {
          role: "user",
          content: inputText.substring(0, 4000) // Limitar tamaño
        }
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ DeepSeek API Error ${response.status}:`, errorText.substring(0, 200));
      throw new Error(`API Error ${response.status}`);
    }

    const data = await response.json();
    console.log("✅ DeepSeek Response received");
    
    const content = data?.choices?.[0]?.message?.content;
    
    if (!content) {
      console.warn("⚠️ Empty response from DeepSeek");
      throw new Error("Empty response");
    }

    // Parsear JSON
    try {
      const parsed = JSON.parse(content);
      console.log("📊 DeepSeek analysis successful");
      return parsed;
    } catch (parseError) {
      // Intentar extraer JSON del texto
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error("Invalid JSON response");
    }

  } catch (error) {
    console.error("🌐 DeepSeek call failed:", {
      error: error.message,
      name: error.name,
      code: error.code
    });
    
    // Fallback a análisis local
    return localCvAnalysis(inputText);
  }
}