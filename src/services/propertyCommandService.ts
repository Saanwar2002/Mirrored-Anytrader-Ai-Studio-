/**
 * Server-authoritative property creation.
 * The server derives ownership and enforces any Gotham purchased-door allowance.
 */
export async function createPropertyViaCommand(
  user: { getIdToken: () => Promise<string> },
  payload: Record<string, unknown>
): Promise<{ id: string; duplicate: boolean }> {
  const token = await user.getIdToken();
  if (!token) throw new Error("You must be signed in to create a property.");
  const idempotencyKey = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `property_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
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
