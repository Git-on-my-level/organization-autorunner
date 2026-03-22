import { json } from "@sveltejs/kit";

import {
  finishControlLogin,
  finishControlRegistration,
  logoutControlSession,
  loadControlSession,
  startControlLogin,
  startControlRegistration,
} from "$lib/server/controlSession.js";

export async function POST(event) {
  const body = await event.request.json();
  const action = body.action;

  if (action === "register-start") {
    const email = String(body.email ?? "").trim();
    const displayName = String(body.display_name ?? "").trim();

    if (!email || !displayName) {
      return json(
        {
          error: {
            code: "invalid_request",
            message: "Email and display name are required.",
          },
        },
        { status: 400 },
      );
    }

    try {
      const result = await startControlRegistration(event, email, displayName);

      return json(result);
    } catch (error) {
      return json(
        {
          error: {
            code: "registration_start_failed",
            message:
              error instanceof Error
                ? error.message
                : "Failed to start registration",
          },
        },
        { status: 400 },
      );
    }
  }

  if (action === "register-finish") {
    const registrationSessionId = body.registration_session_id;
    const credential = body.credential;

    if (!registrationSessionId || !credential) {
      return json(
        {
          error: {
            code: "invalid_request",
            message: "Registration session and credential are required.",
          },
        },
        { status: 400 },
      );
    }

    try {
      const result = await finishControlRegistration(
        event,
        registrationSessionId,
        credential,
      );

      return json({
        account: result.account,
      });
    } catch (error) {
      return json(
        {
          error: {
            code: "registration_finish_failed",
            message:
              error instanceof Error
                ? error.message
                : "Failed to finish registration",
          },
        },
        { status: 400 },
      );
    }
  }

  if (action === "login-start") {
    const email = String(body.email ?? "").trim();

    if (!email) {
      return json(
        { error: { code: "invalid_request", message: "Email is required." } },
        { status: 400 },
      );
    }

    try {
      const result = await startControlLogin(event, email);

      return json(result);
    } catch (error) {
      return json(
        {
          error: {
            code: "login_start_failed",
            message:
              error instanceof Error ? error.message : "Failed to start login",
          },
        },
        { status: 400 },
      );
    }
  }

  if (action === "login-finish") {
    const sessionId = body.session_id;
    const credential = body.credential;

    if (!sessionId || !credential) {
      return json(
        {
          error: {
            code: "invalid_request",
            message: "Session and credential are required.",
          },
        },
        { status: 400 },
      );
    }

    try {
      const result = await finishControlLogin(event, sessionId, credential);

      return json({
        account: result.account,
      });
    } catch (error) {
      return json(
        {
          error: {
            code: "login_finish_failed",
            message:
              error instanceof Error ? error.message : "Failed to finish login",
          },
        },
        { status: 400 },
      );
    }
  }

  return json(
    { error: { code: "invalid_action", message: "Unknown action" } },
    { status: 400 },
  );
}

export async function DELETE(event) {
  try {
    await logoutControlSession(event);
  } catch {
    // Ignore errors during logout
  }

  return json({ revoked: true });
}

export async function GET(event) {
  const session = await loadControlSession(event);

  if (session?.account) {
    return json({
      account: session.account,
    });
  }

  return json({
    account: null,
  });
}
