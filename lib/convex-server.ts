const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;

function getConvexConfig() {
  if (!convexUrl || !process.env.CONVEX_INGEST_SECRET) {
    return null;
  }
  return { convexUrl: convexUrl.replace(/\/$/, ""), secret: process.env.CONVEX_INGEST_SECRET };
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
    const response = await fetch(`${config.convexUrl}/events/bot-message`, {
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
