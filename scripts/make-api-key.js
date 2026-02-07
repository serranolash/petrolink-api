const crypto = require("crypto");

const apiKey = crypto.randomBytes(32).toString("hex");
const salt = process.env.API_KEY_SALT;

if (!salt) {
  console.error("Falta API_KEY_SALT en .env");
  process.exit(1);
}

const key_hash = crypto.createHash("sha256").update(apiKey + salt).digest("hex");

console.log("API KEY (guardala):", apiKey);
console.log("HASH (va a Supabase api_keys.key_hash):", key_hash);
