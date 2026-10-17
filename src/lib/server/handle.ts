import type { Handle } from "@sveltejs/kit";
import { parseTheme, THEME_COOKIE, withTheme } from "$lib/theme";
import type { App } from "./app.ts";
import { gate } from "./identity/gate.ts";
import type { IdentityResolver } from "./identity/index.ts";

/**
 * Per request: refuse remote calls, read the Instance mode, resolve Identity with the adapter that mode
 * names (none before Setup), let the gate decide, then render. Every response, refusals included,
 * refuses framing. Better Auth's handler is mounted as a route (`/api/auth/[...all]`), so the gate
 * judges it like any page; an unmatched path has no route and the gate decides it too.
 */
export function createHandle(
  app: Pick<App, "core" | "identity" | "instance" | "multiUser" | "setup">,
): Handle {
  return async ({ event, resolve }) => {
    const { url, request } = event;
    // Remote calls take their pathname and route from client headers, so the gate cannot judge them; none exist yet.
    // Static files never reach this hook (the server answers them first).
    if (event.isRemoteRequest) return refuseFraming(refusal(404));

    event.locals.instance = app.instance;
    event.locals.setup = app.setup;
    const mode = app.instance.mode();
    // Before Setup nobody is resolved, so no Local Learner is made. Only the adapter the mode names is
    // asked: in Multi-user the Local adapter, and its test cookie, is never consulted.
    let who: Awaited<ReturnType<IdentityResolver["resolve"]>> = null;
    if (mode === "local") who = await app.identity.resolve(event);
    if (mode === "multi") {
      // Cannot happen at start (createApp refuses it); fail closed rather than serve nobody.
      if (!app.multiUser) return refuseFraming(refusal(503));
      event.locals.auth = app.multiUser.auth;
      event.locals.invites = app.multiUser.invites;
      who = await app.multiUser.identity.resolve(event);
    }
    // An active session was extended: its new cookie goes out with whatever this request answers (a
    // redirect or refusal included), or users are signed out after 7 days of use. Better Auth's own
    // Set-Cookie line, unchanged. Never over a cookie of the same name that the response sets itself:
    // a sign-in as someone else, a sign-out or a password change answers with the cookie that must win.
    const refreshed = who?.refreshedCookies ?? [];
    const finish = (response: Response) => {
      const own = new Set(response.headers.getSetCookie().map(cookieName));
      for (const cookie of refreshed) {
        if (!own.has(cookieName(cookie)))
          response.headers.append("set-cookie", cookie);
      }
      return refuseFraming(response);
    };

    const verdict = gate({
      mode,
      who,
      mustChangePassword: who?.mustChangePassword,
      routeId: event.route.id,
      isDataRequest: event.isDataRequest,
      method: request.method,
      pathname: url.pathname,
      search: url.search,
    });
    if (verdict.kind === "redirect") {
      return finish(
        new Response(null, {
          status: verdict.status,
          headers: { location: verdict.location, "Cache-Control": "no-store" },
        }),
      );
    }
    if (verdict.kind === "status") {
      return finish(refusal(verdict.status));
    }

    // Unset where nobody is resolved: /setup before Setup, and the public pages of a multi-user Instance.
    if (who) {
      event.locals.identity = {
        learnerId: who.learnerId,
        displayName: who.displayName,
        role: who.role,
      };
      event.locals.learning = app.core.forLearner(who.learnerId);
    }
    // No theme cookie means follow the device; a choice goes on <html> in the server render, so no flash.
    // Read when the page renders, not before: an action that just set the cookie is seen by its own response.
    const response = await resolve(event, {
      transformPageChunk: ({ html }) =>
        withTheme(html, parseTheme(event.cookies.get(THEME_COOKIE))),
    });
    // Users shows everyone's names and emails and the one-time Invite link: never cached, whatever
    // answers (the page, a data request, an action result, an error). Set here, once, because a
    // route that sets it in both its action and its load makes SvelteKit throw on a no-JS form post.
    if (event.route.id === "/users")
      response.headers.set("Cache-Control", "no-store");
    return finish(response);
  };
}

/** The name of a `Set-Cookie` line: what comes before the first `=`. */
const cookieName = (setCookie: string) =>
  setCookie.slice(0, setCookie.indexOf("=")).trim();

/** A gate decision depends on the Instance state, so it is never cached. */
function refusal(status: 403 | 404 | 503): Response {
  const text = {
    403: "Forbidden",
    404: "Not found",
    503: "Service unavailable",
  }[status];
  return new Response(text, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Reset progress is destructive: no other site may frame the app and trick a click (clickjacking). */
function refuseFraming(response: Response): Response {
  response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}
