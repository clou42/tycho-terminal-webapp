// Azure Queue REST client. The App Service identity is scoped to the docking bus.
// The local mode intentionally does not contact Azure.
const requests = process.env.DOCKING_REQUEST_QUEUE || "tycho-docking-requests";
const results = process.env.DOCKING_RESULTS_QUEUE || "tycho-docking-results";
let cachedToken;

export function dockingMode() {
  return process.env.DOCKING_MODE || (process.env.DOCKING_QUEUE_ACCOUNT ? "azure" : "local");
}

async function storageToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  if (!process.env.IDENTITY_ENDPOINT || !process.env.IDENTITY_HEADER) {
    throw new Error("App Service managed identity is unavailable");
  }
  const url = new URL(process.env.IDENTITY_ENDPOINT);
  url.searchParams.set("resource", "https://storage.azure.com/");
  url.searchParams.set("api-version", "2019-08-01");
  const response = await fetch(url, {
    headers: { "X-IDENTITY-HEADER": process.env.IDENTITY_HEADER },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Storage identity request failed (${response.status})`);
  const body = await response.json();
  if (!body.access_token) throw new Error("Storage identity response had no token");
  const expiry = Number(body.expires_on) * 1000 || Date.parse(body.expires_on);
  cachedToken = { value: body.access_token, expiresAt: expiry || Date.now() + 300_000 };
  return cachedToken.value;
}

async function queueRequest(queue, method, suffix = "", body) {
  const account = process.env.DOCKING_QUEUE_ACCOUNT;
  if (!account) throw new Error("DOCKING_QUEUE_ACCOUNT is missing");
  const token = await storageToken();
  const response = await fetch(`https://${account}.queue.core.windows.net/${queue}/messages${suffix}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "x-ms-version": "2023-11-03",
      "x-ms-date": new Date().toUTCString(),
      ...(body ? { "Content-Type": "application/xml" } : {}),
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Docking queue ${method} failed (${response.status}): ${text.slice(0, 250)}`);
  return text;
}

function xmlValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match?.[1]?.replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

export async function enqueueDocking(job) {
  const payload = Buffer.from(JSON.stringify(job), "utf8").toString("base64");
  await queueRequest(requests, "POST", "", `<QueueMessage><MessageText>${payload}</MessageText></QueueMessage>`);
}

export async function receiveResults() {
  const xml = await queueRequest(results, "GET", "?numofmessages=16&visibilitytimeout=45");
  const messages = [];
  for (const match of xml.matchAll(/<QueueMessage>([\s\S]*?)<\/QueueMessage>/g)) {
    const item = match[1];
    const id = xmlValue(item, "MessageId");
    const receipt = xmlValue(item, "PopReceipt");
    const encoded = xmlValue(item, "MessageText");
    if (!id || !receipt || !encoded) continue;
    let value;
    try { value = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")); }
    catch { value = null; }
    messages.push({ id, receipt, value });
  }
  return messages;
}

export async function deleteResult(message) {
  const suffix = `/${encodeURIComponent(message.id)}?popreceipt=${encodeURIComponent(message.receipt)}`;
  await queueRequest(results, "DELETE", suffix);
}
