
// Example 1: Basic Profile Analysis
const analyzeProfile = async () => {
  const response = await fetch('https://api.petrolinkhub.com/v1/analyze/profile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'your_api_key_here'
    },
    body: JSON.stringify({
      profile: {
        nombre: "Carlos Rodríguez",
        experienciaOilGas: "15 años en perforación offshore",
        habilidades: ["HSE Management", "IWCF", "Drilling Operations"],
        paisResidencia: "Venezuela",
        segmentoExperticia: "Drilling Supervisor",
        descripcion: "Experto en operaciones de perforación..."
      },
      options: {
        source: "manual_upload",
        language: "es"
      }
    })
  });

  const data = await response.json();
  console.log('Analysis Result:', data);
};

// Example 2: CV Processing
const analyzeCV = async () => {
  const cvText = \`Carlos Rodríguez
  Experience: 15 years offshore drilling
  Skills: HSE, IWCF, Drilling\