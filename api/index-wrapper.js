const app = require("./index");

// Este wrapper ajusta el path para que Express vea "/" en lugar de "/api/index"
module.exports = (req, res) => {
  const originalUrl = req.url || "/";

  // Recortar el prefijo que Vercel agrega por ruta de function
  // /api/index/...  ->  /...
  req.url = originalUrl.replace(/^\/api\/index(?=\/|$)/, "") || "/";

  return app(req, res);
};
