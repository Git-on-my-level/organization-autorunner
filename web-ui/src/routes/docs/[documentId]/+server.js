import { json } from "@sveltejs/kit";
import { getMockDocument } from "$lib/mockCoreData";
import { guardMockRoute } from "$lib/server/mockGuard";

export function GET({ url, params }) {
  const guardResponse = guardMockRoute(url.pathname);
  if (guardResponse) return guardResponse;
  const result = getMockDocument(params.documentId);
  if (!result)
    return json(
      {
        error: {
          code: "not_found",
          message: "document not found",
          recoverable: false,
          hint: "",
        },
      },
      { status: 404 },
    );
  return json(result);
}
