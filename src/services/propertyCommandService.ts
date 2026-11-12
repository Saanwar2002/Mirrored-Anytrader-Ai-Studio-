/**
 * Server-authoritative property creation.
 * The server derives ownership and enforces any Gotham purchased-door allowance.
 */
const pendingPropertyCreationKeys = new Map<string, string>();

export async function createPropertyViaCommand(
  user: { uid?: string; getIdToken: () => Promise<string> },
  payload: Record<string, unknown>,
  suppliedIdempotencyKey?: string
): Promise<{ id: string; duplicate: boolean }> {
  const token = await user.getIdToken();
  if (!token) throw new Error("You must be signed in to create a property.");
  if (suppliedIdempotencyKey && !/^[A-Za-z0-9_-]{12,100}$/.test(suppliedIdempotencyKey)) {
    throw new Error("Property creation idempotency key is invalid.");
  }

  const requestFingerprint = `${user.uid || token.slice(0, 24)}:${JSON.stringify(payload)}`;
  const idempotencyKey = suppliedIdempotencyKey ||
    pendingPropertyCreationKeys.get(requestFingerprint) ||
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `property_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`);
  if (!suppliedIdempotencyKey) pendingPropertyCreationKeys.set(requestFingerprint, idempotencyKey);

  const response = await fetch("/api/properties", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Property could not be created.");
  if (!result.id) throw new Error("Property creation returned no identifier.");
  if (pendingPropertyCreationKeys.get(requestFingerprint) === idempotencyKey) {
    pendingPropertyCreationKeys.delete(requestFingerprint);
  }
  return { id: String(result.id), duplicate: Boolean(result.duplicate) };
}

export async function deletePropertyViaCommand(
  user: { getIdToken: () => Promise<string> },
  propertyId: string
): Promise<void> {
  const token = await user.getIdToken();
  if (!token) throw new Error("You must be signed in to delete a property.");
  const response = await fetch(`/api/properties/${encodeURIComponent(propertyId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Property could not be deleted.");
}

export async function verifyPropertyTransferCode(code: string): Promise<any> {
  const normalizedCode = code.trim().toUpperCase();
  const response = await fetch(`/api/properties/transfer/${encodeURIComponent(normalizedCode)}`);
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.property) throw new Error(result.error || "Transfer code could not be verified.");
  return result.property;
}

export async function claimPropertyTransfer(
  user: { getIdToken: () => Promise<string> },
  code: string
): Promise<{ id: string; duplicate: boolean }> {
  const token = await user.getIdToken();
  if (!token) throw new Error("You must be signed in to claim a property.");
  const response = await fetch("/api/properties/claim-transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code: code.trim().toUpperCase() })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.id) throw new Error(result.error || "Property transfer could not be completed.");
  return { id: String(result.id), duplicate: Boolean(result.duplicate) };
}

export async function initiatePropertyTransfer(
  user: { getIdToken: () => Promise<string> },
  propertyId: string,
  input: { buyerName?: string; buyerEmail?: string; validityDays: number }
): Promise<{ code: string; expiresAt: string }> {
  const token = await user.getIdToken();
  if (!token) throw new Error("You must be signed in to initiate a property transfer.");
  const response = await fetch(`/api/properties/${encodeURIComponent(propertyId)}/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(input)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.code) throw new Error(result.error || "Property transfer could not be initiated.");
  return { code: String(result.code), expiresAt: String(result.expiresAt || "") };
}

export async function revokePropertyTransfer(
  user: { getIdToken: () => Promise<string> },
  propertyId: string
): Promise<void> {
  const token = await user.getIdToken();
  if (!token) throw new Error("You must be signed in to revoke a property transfer.");
  const response = await fetch(`/api/properties/${encodeURIComponent(propertyId)}/transfer/revoke`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Property transfer could not be revoked.");
}
