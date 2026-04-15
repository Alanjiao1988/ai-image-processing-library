import { useEffect, useState } from "react";

import { apiClient } from "../api/client";
import type { JobCreatedResponse, JobResponse } from "../types/api";

const POLL_INTERVAL_MS = Number(import.meta.env.VITE_JOB_POLL_INTERVAL_MS || 3000);

export function useGenerationJob() {
  const [submitting, setSubmitting] = useState(false);
  const [jobMessage, setJobMessage] = useState<string | null>(null);
  const [job, setJob] = useState<JobResponse | null>(null);
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pollingJobId) {
      return;
    }

    let cancelled = false;
    let nextTimer: number | null = null;

    const poll = async () => {
      try {
        const jobResponse = await apiClient.getJob(pollingJobId);

        if (cancelled) {
          return;
        }

        setJob(jobResponse);

        if (jobResponse.status === "SUCCEEDED" || jobResponse.status === "FAILED") {
          setPollingJobId(null);
          return;
        }

        nextTimer = window.setTimeout(() => {
          void poll();
        }, POLL_INTERVAL_MS);
      } catch (pollError) {
        if (cancelled) {
          return;
        }

        setError(
          pollError instanceof Error ? pollError.message : "任务状态轮询失败，请稍后重试。",
        );
        setPollingJobId(null);
      }
    };

    void poll();

    return () => {
      cancelled = true;

      if (nextTimer !== null) {
        window.clearTimeout(nextTimer);
      }
    };
  }, [pollingJobId]);

  const startJob = async (createJob: () => Promise<JobCreatedResponse>) => {
    try {
      setSubmitting(true);
      setError(null);
      setJob(null);
      setJobMessage(null);
      setPollingJobId(null);

      const createdJob = await createJob();
      setJobMessage(createdJob.message);
      setPollingJobId(createdJob.jobId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "生成任务提交失败。");
    } finally {
      setSubmitting(false);
    }
  };

  const resetFeedback = () => {
    setError(null);
    setJob(null);
    setJobMessage(null);
    setPollingJobId(null);
  };

  return {
    submitting,
    jobMessage,
    job,
    error,
    pollIntervalMs: POLL_INTERVAL_MS,
    isPolling: Boolean(pollingJobId),
    isBusy: submitting || Boolean(pollingJobId),
    startJob,
    setError,
    resetFeedback,
  };
}
