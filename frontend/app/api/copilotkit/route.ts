/**
 * CopilotKit Runtime API route — bridges CopilotKit frontend protocol to
 * the ag_ui_adk backend (AG-UI SSE endpoint).
 *
 * Architecture:
 *   Browser → POST /api/copilotkit (this route, CopilotKit protocol)
 *           → HttpAgent → http://localhost:8000/ (ag_ui_adk, AG-UI protocol)
 *
 * The HttpAgent from @ag-ui/client speaks AG-UI natively.
 * CopilotRuntime wraps it and exposes the CopilotKit protocol to the frontend.
 */

import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { HttpAgent } from "@ag-ui/client";
import { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000/adk/v1/app";

const serviceAdapter = new ExperimentalEmptyAdapter();

const runtime = new CopilotRuntime({
  agents: {
    // Key must match the name passed to useCoAgent({ name: "aegis_pipeline" })
    aegis_pipeline: new HttpAgent({ url: BACKEND_URL }),
  },
});

export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
};
