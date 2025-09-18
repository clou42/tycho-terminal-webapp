import { doFetch, fetchUrl } from "../services/http.service.js";

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
    const url = (req.body && req.body.url) ? String(req.body.url).trim() : '';
    const headersText = (req.body && req.body.headers) ? String(req.body.headers) : '';

    if (!url) {
      return res.status(400).render('pages/proxy', {
        title: 'API Proxy',
        url,
        body: 'Error: URL is required.'
      });
    }

    // NOTE: http.fetchUrl(url, headersText) must accept the header block (one "Name: value" per line)
    const result = await fetchUrl(url, headersText);

    // Render the same proxy view with the fetched response body
    res.render('pages/proxy', {
      title: 'API Proxy',
      url,
      body: result && typeof result.body === 'string'
        ? result.body
        : JSON.stringify(result, null, 2)
    });
  } catch (err) {
    res.status(502).render('pages/proxy', {
      title: 'API Proxy',
      url: (req.body && req.body.url) || '',
      body: 'Fetch failed: ' + (err && err.message ? err.message : String(err))
    });
  }
}

export async function crewLookup(req, res, next) {
  try {
    res.json([
      { name: "Drummer", faction: "OPA" },
      { name: "Fred Johnson", faction: "OPA" },
    ]);
  } catch (err) { next(err); }
}
