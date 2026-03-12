export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { recoverJobs } = await import("./lib/job-runner");
    await recoverJobs();

    const { scheduler } = await import("./lib/scheduler");
    await scheduler.init();
  }
}
