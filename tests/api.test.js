import test from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.TEST_BASE_URL || "http://localhost:8080";
const KEY = process.env.API_KEY || "CHANGE_ME_TEST_KEY";

test("GET /health returns ok", async () => {
  const r = await fetch(`${BASE}/health`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
});

test("POST /v1/analyze/profile requires api key", async () => {
  const r = await fetch(`${BASE}/v1/analyze/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile: { nombre: "Test" } }),
  });
  assert.equal(r.status, 401);
});

test("POST /v1/analyze/profile works with api key", async () => {
  const r = await fetch(`${BASE}/v1/analyze/profile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": KEY,
    },
    body: JSON.stringify({
      profile: {
        nombre: "Ana López",
        experienciaOilGas: "8 años en seguridad industrial",
        habilidades: ["HSE", "NEBOSH", "Auditorías"],
        descripcion: "Experta en sistemas de gestión HSE",
      },
    }),
  });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.ok(j.analysis);
  assert.ok(typeof j.analysis.score === "number");
});
