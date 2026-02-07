# Petrolink API (MVP)

## Requisitos
- Node.js 18+ (recomendado 20+)

## Instalación
```bash
npm install
```

## Configurar variables de entorno
Copiá `.env.example` a `.env` y editá la API key:
```bash
cp .env.example .env
# Editá .env y cambiá API_KEY
```

También podés generar una key:
```bash
node generate-test-keys.js
```

## Levantar el server
```bash
npm run dev
# o
npm start
```

Por defecto corre en: `http://localhost:8080`

## Pruebas rápidas con cURL

### 1) Health
```bash
curl -X GET http://localhost:8080/health
```

### 2) Análisis de perfil básico
Reemplazá `YOUR_API_KEY` por el valor de `API_KEY` de tu `.env`:
```bash
curl -X POST http://localhost:8080/v1/analyze/profile \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "profile": {
      "nombre": "Ana López",
      "experienciaOilGas": "8 años en seguridad industrial",
      "habilidades": ["HSE", "NEBOSH", "Auditorías"],
      "descripcion": "Experta en sistemas de gestión HSE"
    }
  }'
```

### 3) Búsqueda de perfiles (MVP mock)
```bash
curl -X GET "http://localhost:8080/v1/search?skills=HSE&min_score=7" \
  -H "X-API-Key: YOUR_API_KEY"
```

## Tests automatizados
> Importante: el server debe estar levantado antes de correr tests (por ahora).
```bash
npm test
```

## Integración en Intelligence Hub
Copiá/pegá el archivo `src/services/apiService.js` dentro de tu repo del Hub y usalo así:

```js
import { PetrolinkAPIClient } from '../services/apiService';

const apiClient = new PetrolinkAPIClient('your-api-key');

const analyzeWithAPI = async (candidate) => {
  const result = await apiClient.analyzeCandidate(candidate);
  // result.ok, result.analysis, result.analysis.skills_enhanced, etc.
  return result;
};
```

## Nota sobre IA externa
Por defecto `AI_PROVIDER=mock` (no llama a proveedores externos).
Si querés DeepSeek:
- Seteá `AI_PROVIDER=deepseek`
- Seteá `DEEPSEEK_API_URL` y `DEEPSEEK_API_KEY`
