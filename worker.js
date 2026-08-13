export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (
      url.pathname === "/beta/register/" ||
      url.pathname === "/beta/register" ||
      url.pathname === "/beta/register/index.html"
    ) {
      return Response.redirect(new URL("/beta/apply/", url).toString(), 308);
    }

    return env.ASSETS.fetch(request);
  },
};
