import { listDockingJobs, submitDockingJob, syncDockingResults } from "../services/docking.service.js";

export async function getDocking(req, res, next) {
  try {
    let warning = "";
    try { await syncDockingResults(); }
    catch (error) { warning = `Dispatch status is temporarily unavailable: ${error.message}`; }
    const jobs = await listDockingJobs();
    res.render("pages/docking", { title: "Docking Queue", jobs, warning, error: "" });
  } catch (error) { next(error); }
}

export async function postDocking(req, res, next) {
  try {
    await submitDockingJob({
      ship: req.body.ship,
      probeTarget: req.body.probeTarget,
      targetVm: req.body.targetVm,
    });
    res.redirect("/docking");
  } catch (error) {
    try {
      const jobs = await listDockingJobs();
      res.status(400).render("pages/docking", { title: "Docking Queue", jobs, warning: "", error: error.message });
    } catch (renderError) { next(renderError); }
  }
}
