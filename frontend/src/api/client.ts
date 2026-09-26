import type {
  Crossing,
  CrossingBrief,
  CrossingPatch,
  ItsDevice,
  ItsDeviceCreate,
  ItsDevicePatch,
  SignalCycle,
  SignalCyclePatch,
} from "../types";

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
  addItsDevice: (crossingId: number, body: ItsDeviceCreate) =>
    request<ItsDevice>(`/crossings/${crossingId}/its-devices`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateItsDevice: (id: number, patch: ItsDevicePatch) =>
    request<ItsDevice>(`/its-devices/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  removeItsDevice: (id: number) => request<void>(`/its-devices/${id}`, { method: "DELETE" }),
  addSignalCycle: (crossingId: number, body: SignalCyclePatch & { name: string }) =>
    request<SignalCycle>(`/crossings/${crossingId}/signal-cycles`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateSignalCycle: (id: number, patch: SignalCyclePatch) =>
    request<SignalCycle>(`/signal-cycles/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  removeSignalCycle: (id: number) => request<void>(`/signal-cycles/${id}`, { method: "DELETE" }),
};
