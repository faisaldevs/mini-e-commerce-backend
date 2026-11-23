import { createRouter } from "./core/router.js";
import { sendResponse } from "./core/response.js";
import { healthRouter } from "./modules/health/health.route.js";

const API_PREFIX = "/api/v1";

export const rootRouter = createRouter();

rootRouter.use(API_PREFIX, healthRouter);

// TEMP (M2 testing only) — delete after the checks pass.

const echoRouter = createRouter();
echoRouter.get("/echo/:id", (req, res) => {
  sendResponse(res, 200, { data: { params: req.params, query: req.query } });
});
rootRouter.use(API_PREFIX, echoRouter);
