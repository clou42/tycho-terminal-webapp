export function notFound(req, res, next) {
  res.status(404);
  if (req.accepts("html")) return res.render("pages/404", { title: "Not Found" });
  res.json({ error: "Not Found" });
}

export function errorHandler(err, req, res, next) {
  console.error(err);
  const status = res.statusCode >= 400 ? res.statusCode : 500;
  if (req.accepts("html")) return res.status(status).render("pages/error", { title: "Error", message: err.message });
  res.status(status).json({ error: err.message });
}