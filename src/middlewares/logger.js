// One JSON line per request, written when the response is finished so the
// final status (including errors and short-circuits) is known.
export async function logger(req, res, next) {
  const start = performance.now();

  res.on("close", () => {
    const status = res.statusCode;
    const line = {
      time: new Date().toISOString(),
      level: status >= 500 ? "error" : "info",
      requestId: req.id,
      method: req.method,
      path: req.url.split("?")[0], // query may carry secrets
      status,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
    };
    if (status >= 500 && req.error) {
      line.message = req.error.message;
      line.stack = req.error.stack; // logs only, never in a response
    }
    console.log(JSON.stringify(line));
  });

  await next();
}
