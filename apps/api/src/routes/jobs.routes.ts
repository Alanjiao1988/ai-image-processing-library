import { Router } from "express";

import { jobService } from "../services/jobs/job.service";
import { asyncHandler } from "../utils/async-handler";

export const jobsRouter = Router();

jobsRouter.get(
  "/:jobId",
  asyncHandler(async (request, response) => {
    response.json(await jobService.getJob(request.params.jobId));
  }),
);
