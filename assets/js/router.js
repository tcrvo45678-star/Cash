const routes = [];
let notFoundHandler = null;
let current = null;

export function registerRoute(pattern, handler) {
  const paramNames = [];
  const regexStr = pattern.replace(/:[^/]+/g, (m) => { paramNames.push(m.slice(1)); return "([^/]+)"; });
  const regex = new RegExp(`^${regexStr}$`);
  routes.push({ regex, paramNames, handler, pattern });
}

export function setNotFound(handler) {
  notFoundHandler = handler;
}

export function navigate(path) {
  window.location.hash = path;
}

function parseHash() {
  let hash = window.location.hash.slice(1);
  if (!hash) hash = "/overview";
  return hash;
}

export function currentPath() {
  return parseHash();
}

function resolve() {
  const path = parseHash();
  const [pathPart, queryPart] = path.split("?");
  const query = new URLSearchParams(queryPart || "");
  for (const r of routes) {
    const m = pathPart.match(r.regex);
    if (m) {
      const params = {};
      r.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
      current = { path: pathPart, params, query };
      r.handler(params, query);
      return;
    }
  }
  if (notFoundHandler) notFoundHandler();
}

export function startRouter() {
  window.addEventListener("hashchange", resolve);
  resolve();
}

export function getCurrent() {
  return current;
}
