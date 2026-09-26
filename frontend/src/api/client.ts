import type { Intersection, IntersectionBrief, Layout, Run } from "../types";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `${response.status} ${response.statusText}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  intersections: () => request<IntersectionBrief[]>("/intersections"),
  intersection: (id: number) => request<Intersection>(`/intersections/${id}`),
  layout: (id: number) => request<Layout>(`/intersections/${id}/layout`),
  runs: () => request<Run[]>("/runs"),
  startRun: (id: number, programId?: number, seed = 0) =>
    request<Run>(`/intersections/${id}/runs`, {
      method: "POST",
      body: JSON.stringify({ program_id: programId ?? null, seed }),
    }),
  stopRun: (runId: number) => request<Run>(`/runs/${runId}/stop`, { method: "POST" }),
  controlRun: (runId: number, patch: { speed?: number; paused?: boolean }) =>
    request<Run>(`/runs/${runId}`, { method: "PATCH", body: JSON.stringify(patch) }),
};

export function runStreamUrl(runId: number): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${BASE}/ws/runs/${runId}`;
}
