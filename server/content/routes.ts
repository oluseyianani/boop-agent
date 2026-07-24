// HTTP routes for the Content tab's engine card, mounted at /content
// (the dashboard calls them as /api/content/* — the proxy strips /api).

import { Router } from "express";
import { engineStatus, isEngineRunning, runPipeline } from "./runner.js";

export function createContentRouter(): Router {
  const router = Router();

  router.get("/engine", (_req, res) => {
    res.json(engineStatus());
  });

  router.post("/run", (req, res) => {
    if (isEngineRunning()) {
      res.status(409).json({ error: "already running" });
      return;
    }
    const force = Boolean(req.body?.force);
    // Fire and return — progress streams into contentRuns via Convex,
    // which the dashboard watches reactively.
    runPipeline("manual", { force }).catch((e) =>
      console.error("[content] manual run failed:", (e as Error).message),
    );
    res.json({ ok: true });
  });

  return router;
}
