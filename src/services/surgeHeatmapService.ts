import { getApiUrl } from "@/src/lib/apiUrl";

export interface SurgeZone {
  lat: number;
  lng: number;
  radius: number;
  intensity: "high" | "medium" | "low";
  label: string;
  surgeMultiplier: number;
  maxWaitTimeMins?: number;
  waitWarning?: boolean;
  extraFee?: number;
  isFixedModel?: boolean;
  uiColor?: string;
  uiOpacity?: number;
}

/**
 * Fetches server-aggregated live demand zones.
 * Routes through authenticated server endpoint to prevent direct client querying
 * of driver GPS coordinates or other passengers' private ride requests, eliminating
 * Firestore permission errors and preserving zero-trust privacy.
 */
export async function fetchLiveDemandZones(): Promise<SurgeZone[]> {
  try {
    const response = await fetch(getApiUrl("/api/rides/demand-zones"));
    if (!response.ok) {
      return [];
    }

    const contentType = response.headers?.get ? (response.headers.get("content-type") || "") : "application/json";
    if (contentType && !contentType.includes("application/json")) {
      return [];
    }

    const data = await response.json().catch(() => null);
    if (data && Array.isArray(data.zones)) {
      return data.zones;
    }

    return [];
  } catch (error) {
    // Fail gracefully without flooding console with Firestore permission exceptions
    console.warn("Could not fetch live demand zones from server:", error);
    return [];
  }
}
