import appInsights from "applicationinsights";

import { env } from "../config/env";
import { logger } from "./logger";

let started = false;

export function setupTelemetry() {
  if (started || !env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
    return;
  }

  appInsights
    .setup(env.APPLICATIONINSIGHTS_CONNECTION_STRING)
    .setAutoCollectConsole(true, true)
    .setAutoCollectDependencies(true)
    .setAutoCollectExceptions(true)
    .setAutoCollectPerformance(true, true)
    .setAutoCollectRequests(true)
    .start();

  started = true;
  logger.info("Application Insights telemetry is enabled.");
}
