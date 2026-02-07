async function deepseekAnalyzeCvText(inputText) {
    const url = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1/chat/completions";
    const key = process.env.DEEPSEEK_API_KEY;
  
    if (!key) throw new Error("Missing DEEPSEEK_API_KEY in .env");
  
    // Pedimos JSON estricto. Si DeepSeek lo respeta, genial.
    // Igual tenemos fallback por si mete texto alrededor.
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
      // Si DeepSeek soporta response_format, esto mejora muchísimo la estabilidad.
      // Si NO lo soporta, normalmente lo ignora sin romper.
      response_format: { type: "json_object" }
    };
  
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
      throw new Error(`DeepSeek error ${resp.status}: ${rawText}`);
    }
  
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(`DeepSeek returned non-JSON response: ${rawText.slice(0, 400)}`);
    }
  
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return {};
  
    // 1) parse directo
    try {
      return JSON.parse(content);
    } catch {
      // 2) fallback: extraer primer bloque JSON { ... }
      const m = String(content).match(/\{[\s\S]*\}/);
      if (!m) return {};
      return JSON.parse(m[0]);
    }
  }
  
  module.exports = { deepseekAnalyzeCvText };
  