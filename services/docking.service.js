import { randomUUID } from "node:crypto";
import { dbInfo, ensureSchema, safeExec, safeQueryAll } from "./db.service.js";
import { deleteResult, dockingMode, enqueueDocking, receiveResults } from "./docking-queue.service.js";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listDockingJobs() {
  await ensureSchema();
  const query = dbInfo().engine === "mssql"
    ? "SELECT TOP 20 id, ship, target_vm, probe_target, status, created_at, completed_at, result FROM dbo.docking_jobs ORDER BY created_at DESC"
    : "SELECT id, ship, target_vm, probe_target, status, created_at, completed_at, result FROM docking_jobs ORDER BY created_at DESC LIMIT 20";
  return safeQueryAll(query);
}

export async function submitDockingJob({ ship, probeTarget, targetVm }) {
  if (ship !== "Rocinante") throw new Error("Select an available ship");
  if (typeof probeTarget !== "string" || !probeTarget.trim() || probeTarget.length > 160) {
    throw new Error("Enter a telemetry host (up to 160 characters)");
  }

  const job = {
    id: randomUUID(),
    ship,
    // The UI always dispatches to Rocinante. The API's target override is an
    // intentional trust-boundary flaw for the isolated security lab.
    targetVm: typeof targetVm === "string" && targetVm.trim() ? targetVm.trim() : "Rocinante",
    probeTarget: probeTarget.trim(),
  };
  const now = new Date().toISOString();
  await safeExec(
    "INSERT INTO docking_jobs (id, ship, target_vm, probe_target, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [job.id, job.ship, job.targetVm, job.probeTarget, "queued", now]
  );

  if (dockingMode() === "local") {
    await finishJob({ id: job.id, status: "completed", output: "Local simulation: telemetry relay reachable.", completedAt: new Date().toISOString() });
  } else {
    try { await enqueueDocking(job); }
    catch (error) {
      await finishJob({ id: job.id, status: "failed", output: `Dispatch failed: ${error.message}`, completedAt: new Date().toISOString() });
      throw error;
    }
  }
  return job;
}

async function finishJob(result) {
  if (!result || !ID.test(result.id) || !["completed", "failed"].includes(result.status)) return;
  await safeExec(
    "UPDATE docking_jobs SET status = ?, result = ?, completed_at = ? WHERE id = ? AND status = 'queued'",
    [result.status, String(result.output || "").slice(0, 8000), result.completedAt || new Date().toISOString(), result.id]
  );
}

export async function syncDockingResults() {
  if (dockingMode() !== "azure") return;
  for (let batch = 0; batch < 3; batch++) {
    const messages = await receiveResults();
    if (messages.length === 0) return;
    for (const message of messages) {
      await finishJob(message.value);
      await deleteResult(message);
    }
    if (messages.length < 16) return;
  }
}
