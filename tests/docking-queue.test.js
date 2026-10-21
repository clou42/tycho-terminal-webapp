import test from "node:test";
import assert from "node:assert/strict";
import { enqueueDocking, receiveResults, deleteResult } from "../services/docking-queue.service.js";

test("Azure Queue messages use the Functions base64 wire format and results can be acknowledged", async () => {
  const originalFetch = global.fetch;
  const keys = ["DOCKING_QUEUE_ACCOUNT", "IDENTITY_ENDPOINT", "IDENTITY_HEADER"];
  const originalEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const requests = [];
  try {
    process.env.DOCKING_QUEUE_ACCOUNT = "docktest";
    process.env.IDENTITY_ENDPOINT = "http://identity.local/token";
    process.env.IDENTITY_HEADER = "local-header";
    global.fetch = async (url, options) => {
      const target = String(url);
      requests.push({ target, options });
      if (target.startsWith("http://identity.local")) {
        return new Response(JSON.stringify({ access_token: "test-token", expires_on: "9999999999" }), { status: 200 });
      }
      if (options.method === "GET") {
        const payload = Buffer.from(JSON.stringify({ id: "job-1", status: "completed", output: "ok" })).toString("base64");
        return new Response(`<QueueMessagesList><QueueMessage><MessageId>message-1</MessageId><PopReceipt>abc+/=</PopReceipt><MessageText>${payload}</MessageText></QueueMessage></QueueMessagesList>`, { status: 200 });
      }
      return new Response("", { status: 201 });
    };

    await enqueueDocking({ id: "job-1", targetVm: "Rocinante" });
    const sent = requests.find(item => item.options.method === "POST");
    assert.equal(sent.options.headers.Authorization, "Bearer test-token");
    assert.match(sent.options.body, /<MessageText>eyJ/);
    const decoded = Buffer.from(sent.options.body.match(/<MessageText>(.*?)<\/MessageText>/)[1], "base64").toString();
    assert.equal(JSON.parse(decoded).targetVm, "Rocinante");

    const [result] = await receiveResults();
    assert.equal(result.value.output, "ok");
    await deleteResult(result);
    const deleted = requests.find(item => item.options.method === "DELETE");
    assert.match(deleted.target, /popreceipt=abc%2B%2F%3D/);
  } finally {
    global.fetch = originalFetch;
    for (const key of keys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  }
});
