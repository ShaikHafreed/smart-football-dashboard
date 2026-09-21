import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * A deploy without these variables produced a blank white page.
 *
 * createClient throws while this module is being evaluated, which is before
 * main.jsx runs and therefore before the error boundary exists to catch
 * anything. The module graph fails, nothing renders, and the only evidence is
 * a console line nobody outside a devtools window will see. That is the worst
 * failure a release can have: it looks like the site is broken rather than
 * like it is missing one setting.
 *
 * So the check happens here, first, and says which variable is missing and
 * where to set it. flaskClient.js already takes this position about a missing
 * backend URL; this is the same rule applied to the one piece of
 * configuration the app genuinely cannot start without.
 */
function reportMissingConfig(missing) {
  const message =
    `Smart Football is missing ${missing.join(" and ")}. ` +
    `Set ${missing.length > 1 ? "them" : "it"} in the deployment's environment ` +
    `variables (see .env.example) and redeploy.`;

  // The stylesheet is a static <link> in index.html, so it is already applied
  // even though no JavaScript module finished evaluating. Inline colours back
  // it up in case the design tokens are not the thing that loaded.
  const root = typeof document !== "undefined" && document.getElementById("root");
  if (root) {
    const wrap = document.createElement("main");
    wrap.setAttribute("role", "alert");
    wrap.style.cssText =
      "min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem;font-family:system-ui,sans-serif";

    const card = document.createElement("div");
    card.style.cssText = "max-width:32rem;text-align:center";

    const heading = document.createElement("h1");
    heading.textContent = "This deployment isn't configured yet";
    heading.style.cssText = "font-size:1.25rem;font-weight:600;margin:0 0 .75rem";

    const body = document.createElement("p");
    body.textContent = message;
    body.style.cssText = "margin:0;line-height:1.6;opacity:.75;font-size:.875rem";

    card.append(heading, body);
    wrap.append(card);
    root.replaceChildren(wrap);
  }

  throw new Error(message);
}

const missing = [
  !supabaseUrl && "VITE_SUPABASE_URL",
  !supabaseAnonKey && "VITE_SUPABASE_ANON_KEY",
].filter(Boolean);

if (missing.length) reportMissingConfig(missing);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
