import { Router } from "express";
import { syncAllProjects, syncOneProject } from "./sync.js";

// POST /projects/sync — the UI's "Sync now" button. Runs the repo-sync on
// this host, so it only does real work where the repos live (the Mac). On a
// host without the repos it returns cleanly with everything skipped.
export function createProjectsRouter(): Router {
  const router = Router();

  router.post("/sync", async (req, res) => {
    try {
      const projectId =
        typeof req.body?.projectId === "string" ? req.body.projectId : undefined;
      const results = projectId
        ? [await syncOneProject(projectId)]
        : await syncAllProjects();
      const synced = results.filter((r) => r.ok).length;
      const skipped = results.length - synced;
      res.json({ ok: true, synced, skipped, results });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}
