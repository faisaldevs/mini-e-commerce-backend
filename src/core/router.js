const PARAM_PREFIX = ":";

// '/api/v1/health' --->> [api, v1, health]

function splitPaths(path) {
  return path.split("/").filter(Boolean);
}

// ("/api/v1", "/health") --->> "/api/v1/health"
function joinPaths(...paths) {
  return "/" + paths.flatMap(splitPaths).join("/");
}

/*
 '/products/:id' ---
 -->> [{type: 'static', value : 'products'}, { type: "param",name: "id" }]
*/

function compileRoute(method, path, handler) {
  const segments = splitPaths(path).map((part) =>
    part.startsWith(PARAM_PREFIX)
      ? {
          type: "param",
          name: part.slice(PARAM_PREFIX.length),
        }
      : {
          type: "static",
          name: part,
        },
  );
  return { method, path, segments, handler };
}

function matchSegments(segments, parts) {
  if (segments.length !== parts.length) return null;

  const rawParams = {};
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const part = parts[i];

    if (segment.type === "static") {
      if (segment.name !== part) return null;
    } else {
      rawParams[segment.name] = part;
    }
  }
  return rawParams;
}

function decodeParams(rawParams) {
  const params = {};
  for (const [name, value] of Object.entries(rawParams)) {
    params[name] = decodeURIComponent(value);
  }
  return params;
}

export function createRouter() {
  const routes = [];

  function addRoute(method, path, handler) {
    // Fail at startup, not at request time, if a route is wired wrong.
    if (typeof handler !== "function") {
      throw new TypeError(`Handler for ${method} ${path} must be a function`);
    }
    routes.push(compileRoute(method, path, handler));
  }

  function match(method, pathname) {
    const parts = splitPaths(pathname);
    const allowed = new Set(); // methods registered on this path (for 405)

    for (const route of routes) {
      const rawParams = matchSegments(route.segments, parts);
      if (rawParams === null) continue; // path doesn't match -> next route

      // HEAD is GET without a body; Node strips the body for HEAD automatically.
      const methodMatches =
        route.method === method ||
        (method === "HEAD" && route.method === "GET");

      if (methodMatches) {
        try {
          return {
            status: "found",
            handler: route.handler,
            params: decodeParams(rawParams),
          };
        } catch {
          return {
            status: "bad-request",
            detail: "Malformed percent-encoding in URL path",
          };
        }
      }

      // Path matched but method didn't -> remember it for the Allow header.
      allowed.add(route.method);
      if (route.method === "GET") allowed.add("HEAD");
    }

    if (allowed.size > 0) {
      return { status: "method-not-allowed", allowed: [...allowed] };
    }
    return { status: "not-found" };
  }

  return {
    routes, // exposed so a parent router can copy them in use()
    get: (path, handler) => addRoute("GET", path, handler),
    post: (path, handler) => addRoute("POST", path, handler),
    patch: (path, handler) => addRoute("PATCH", path, handler),
    delete: (path, handler) => addRoute("DELETE", path, handler),

    // Mount a child router under a prefix by copying its routes (flattening).
    use(prefix, childRouter) {
      for (const route of childRouter.routes) {
        addRoute(route.method, joinPaths(prefix, route.path), route.handler);
      }
    },

    match,
  };
}
