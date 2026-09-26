import type { Crossing, CrossingBrief, CrossingPatch } from "../types";

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
  crossings: () => request<CrossingBrief[]>("/crossings"),
  crossing: (id: number) => request<Crossing>(`/crossings/${id}`),
  updateCrossing: (id: number, patch: CrossingPatch) =>
    request<Crossing>(`/crossings/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
};
