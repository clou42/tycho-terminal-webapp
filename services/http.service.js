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