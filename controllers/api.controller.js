import { doFetch } from "../services/http.service.js";

export async function proxyFetch(req, res, next) {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "Missing ?url=" });
    const text = await doFetch(url);
    res.type("text/plain").send(text);
  } catch (err) { next(err); }
}

// NEW: SSRF via POST form, renders a view
export async function proxyFetchForm(req, res, next) {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).render("pages/proxy", {
      title: "API Proxy",
      url: "",
      body: "Missing URL."
    });
    const text = await doFetch(url); // server-side request (SSRF)
    res.render("pages/proxy", {
      title: "API Proxy Result",
      url,
      body: text
    });
  } catch (err) { next(err); }
}

export async function crewLookup(req, res, next) {
  try {
    res.json([
      { name: "Drummer", faction: "OPA" },
      { name: "Fred Johnson", faction: "OPA" },
    ]);
  } catch (err) { next(err); }
}
