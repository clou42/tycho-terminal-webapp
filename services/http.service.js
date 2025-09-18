import http from "http";
import https from "https";
import { URL } from "url";

const BLOCK_INTERNAL = (process.env.BLOCK_INTERNAL || "false").toLowerCase() === "true";
const ALLOW_SELF_SIGNED = (process.env.ALLOW_SELF_SIGNED || "true").toLowerCase() === "true"; // CTF default

function isBlockedHost(u) {
  if (!BLOCK_INTERNAL) return false;
  return ["localhost", "127.0.0.1", "::1", "169.254.169.254"].includes(u.hostname);
}

export async function doFetch(target) {
  const u = new URL(target);
  if (isBlockedHost(u)) throw new Error(`Blocked host: ${u.hostname}`);
  const isHttp = u.protocol === "http:";
  const mod = isHttp ? http : https;

  const options = {
    hostname: u.hostname,
    port: u.port || (isHttp ? 80 : 443),
    path: u.pathname + (u.search || ""),
    method: "GET",
    timeout: 5000,
  };

  return new Promise((resolve, reject) => {
    const req = mod.request(options, (resp) => {
      let data = "";
      resp.on("data", (c) => (data += c));
      resp.on("end", () => resolve(data));
    });

    if (!isHttp && ALLOW_SELF_SIGNED) {
      req.on("socket", (socket) => {
        // @ts-ignore: Node internal
        if (socket) socket.rejectUnauthorized = false;
      });
    }

    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Timeout")));
    req.end();
  });
}

import axios from "axios";

// Parse "Header: value" lines into an object. Ignores blanks and malformed lines safely.
function parseHeaderBlock(text = '') {
  const headers = {};
  String(text).split(/\r?\n/).forEach(line => {
    const i = line.indexOf(':');
    if (i > 0) {
      const key = line.slice(0, i).trim();
      const val = line.slice(i + 1).trim();
      if (key) headers[key] = val;
    }
  });
  return headers;
}

/**
 * Fetch a URL with optional custom headers.
 * @param {string} url
 * @param {string} [headersText] - optional multi-line "Name: value" block
 */
export async function fetchUrl(url, headersText) {
  const custom = parseHeaderBlock(headersText);
  const headers = {
    'User-Agent': 'Tycho-Proxy/1.0',
    ...custom,
  };

  // Allow 1xx–5xx to pass through so the UI can show raw bodies/status.
  const resp = await axios.get(url, {
    headers,
    validateStatus: () => true,
    timeout: 10000,
    maxRedirects: 5,
  });

  // Prefer text; stringify JSON objects to a string so the EJS view can render.
  const body = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data, null, 2);
  return { status: resp.status, headers: resp.headers, body };
}

