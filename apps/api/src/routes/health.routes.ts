import { Router } from "express";

import { healthService } from "../services/health/health.service";
import { registerFrontendHeartbeat } from "../services/health/frontend-heartbeat.store";
import { asyncHandler } from "../utils/async-handler";

export const healthRouter = Router();

healthRouter.get(
  "/summary",
  asyncHandler(async (_request, response) => {
    response.json(await healthService.getSummary());
  }),
);

healthRouter.get(
  "/detail",
  asyncHandler(async (_request, response) => {
    response.json(await healthService.getDetail());
  }),
);

healthRouter.post(
  "/frontend-ping",
  asyncHandler(async (_request, response) => {
    registerFrontendHeartbeat();
    response.status(204).send();
  }),
);
