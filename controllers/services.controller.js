export async function getServices(req, res) {
  // Snapshot environment variables (sorted for stable display)
  const env = Object.keys(process.env)
    .sort()
    .map((k) => ({ key: k, value: String(process.env[k]) }));

  // Sprinkle in some Expanse-flavored “logs” to sell the vibe
  const now = new Date().toISOString();
  const errors = [
    `[${now}] WARN  TychoBus: circuit 'dock-gantries' latency spike — rerouting via ring 3.`,
    `[${now}] ERROR BlueProtoMux: unrecognized biomorphic pattern at Eros(-1).`,
    `[${now}] WARN  StationServices: manifest sync pending; cache: STALE (ttl=-42s).`,
    `[${now}] INFO  Ops handoff — Jim to Alex: I rotated your Rocinante keys. I dropped the updated details in credentials.json — Jim`,
    `[${now}] INFO  Telemetry: opa://tycho/services heartbeat OK; anomalies: 1.`,
  ];
  res.render("pages/services", { title: "Station Services", errors,
    env});
};
