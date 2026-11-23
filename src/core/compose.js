// Chains middlewares of shape (req, res, next). `done` runs after the last one
// (the router goes there). Errors thrown anywhere downstream reject the promise
// that the upstream `await next()` is waiting on.
export function compose(middlewares) {
  for (const fn of middlewares) {
    if (typeof fn !== "function") {
      throw new TypeError("Middleware must be a function");
    }
  }

  return function run(req, res, done) {
    let last = -1;

    async function dispatch(i) {
      if (i <= last) throw new Error("next() called multiple times");
      last = i;

      const fn = i === middlewares.length ? done : middlewares[i];
      if (fn) await fn(req, res, () => dispatch(i + 1));
    }

    return dispatch(0);
  };
}
