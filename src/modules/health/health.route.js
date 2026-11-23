import { sendResponse } from "../../core/response.js";
import { createRouter } from "../../core/router.js";

export const healthRouter = createRouter();

healthRouter.get("/health", (req, res) => {
  sendResponse(res, 200, {
    data: {
      status: "success",
      uptime: Math.floor(process.uptime()),
    },
  });
});
