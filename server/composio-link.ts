// Fork-local shim: Composio deprecated the connected-account creation
// endpoint that @composio/core 0.6.x's connectedAccounts.initiate() calls
// (their API now returns 400 "use POST /api/v3/connected_accounts/link").
// This calls the replacement endpoint directly. Response shape verified
// against the live API on 2026-07-24:
//   { link_token, redirect_url, expires_at, connected_account_id }
// Remove once upstream bumps the SDK past the deprecation.

export async function linkConnectedAccount(
  authConfigId: string,
  userId: string,
  callbackUrl?: string,
): Promise<{ redirectUrl: string; connectionId: string }> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) throw new Error("COMPOSIO_API_KEY not set");
  const res = await fetch("https://backend.composio.dev/api/v3/connected_accounts/link", {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_config_id: authConfigId,
      user_id: userId,
      ...(callbackUrl ? { callback_url: callbackUrl } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`connected_accounts/link failed: ${res.status} ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { redirect_url: string; connected_account_id: string };
  return { redirectUrl: data.redirect_url, connectionId: data.connected_account_id };
}
