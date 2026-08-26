/**
 * Last-resort error boundary — only rendered when something throws
 * during rendering that no closer `error.tsx` catches (there are none
 * yet). Reports to Sentry, since a crash here means `onRequestError` in
 * `src/instrumentation.ts` didn't already catch it (client-side render
 * errors don't go through that hook). Deliberately plain HTML, no shared
 * layout/styles — this has to render even if the app's own CSS/state is
 * what's broken.
 */
"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "sans-serif", textAlign: "center", padding: "48px 16px", color: "#141313" }}>
        <h1 style={{ fontSize: "20px" }}>Something went wrong</h1>
        <p>Sorry about that — please try again, or call us if it keeps happening.</p>
      </body>
    </html>
  );
}
