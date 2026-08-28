import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/events/bot-message",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.CONVEX_INGEST_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await request.json();
    if (
      typeof body.externalBotId !== "string" ||
      typeof body.externalUserId !== "string" ||
      typeof body.phone !== "string" ||
      typeof body.role !== "string" ||
      typeof body.content !== "string"
    ) {
      return new Response("Invalid payload", { status: 400 });
    }

    await ctx.runMutation(internal.botConversations.appendMessage, {
      externalBotId: body.externalBotId,
      externalUserId: body.externalUserId,
      phone: body.phone,
      message: {
        role: body.role,
        content: body.content,
        timestamp: typeof body.timestamp === "number" ? body.timestamp : Date.now(),
      },
    });

    return Response.json({ ok: true });
  }),
});

http.route({
  path: "/events/bot-message",
  method: "DELETE",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.CONVEX_INGEST_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await request.json();
    if (typeof body.externalBotId !== "string" || typeof body.phone !== "string") {
      return new Response("Invalid payload", { status: 400 });
    }

    await ctx.runMutation(internal.botConversations.deleteByBotPhone, {
      externalBotId: body.externalBotId,
      phone: body.phone,
    });

    return Response.json({ ok: true });
  }),
});

export default http;
