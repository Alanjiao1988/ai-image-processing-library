import { Router } from "express";

import { filesRouter } from "./files.routes";
import { healthRouter } from "./health.routes";
import { imageRouter } from "./image.routes";
import { jobsRouter } from "./jobs.routes";
import { libraryRouter } from "./library.routes";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/image", imageRouter);
apiRouter.use("/jobs", jobsRouter);
apiRouter.use("/library", libraryRouter);
apiRouter.use("/files", filesRouter);
