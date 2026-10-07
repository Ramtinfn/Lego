/**
 * Gate of All Nations — Persepolis brick design showcase.
 * Serves the static site from ./public. No API routes.
 */
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  }
};
