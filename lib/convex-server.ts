const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
// HTTP actions are served from the Convex *site* URL (e.g. *.convex.site),
// not the deployment URL (*.convex.cloud). Fall back to the deployment URL
// for local dev, where the site is served on the same origin.
function getConvexConfig() {
  if (!convexUrl || !process.env.CONVEX_INGEST_SECRET) {
    return null;
  }
  const siteUrl =
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL ||
    process.env.CONVEX_SITE_URL ||
    convexUrl;
  return {
    convexUrl: convexUrl.replace(/\/$/, ""),
    siteUrl: siteUrl.replace(/\/$/, ""),
    secret: process.env.CONVEX_INGEST_SECRET,
  };
}

export async function publishBotMessage(input: {
  externalBotId: string;
  externalUserId: string;
  phone: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}) {
  const config = getConvexConfig();
  if (!config) return false;

  try {
    const response = await fetch(`${config.siteUrl}/events/bot-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.secret}`,
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      console.error("Convex bot message error:", response.status, await response.text());
    }
    return response.ok;
  } catch (error) {
    console.error("Convex bot message request failed:", error);
    return false;
  }
}
