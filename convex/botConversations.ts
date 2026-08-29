import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

const message = v.object({
  role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
  content: v.string(),
  timestamp: v.number(),
});

export const get = query({
  args: { externalBotId: v.string(), phone: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("botConversations")
      .withIndex("by_bot_phone", (q) =>
        q.eq("externalBotId", args.externalBotId).eq("phone", args.phone),
      )
      .unique();
  },
});

export const appendMessage = internalMutation({
  args: {
    externalBotId: v.string(),
    externalUserId: v.string(),
    phone: v.string(),
    message,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("botConversations")
      .withIndex("by_bot_phone", (q) =>
        q.eq("externalBotId", args.externalBotId).eq("phone", args.phone),
      )
      .unique();

    if (!existing) {
      return await ctx.db.insert("botConversations", {
        externalBotId: args.externalBotId,
        externalUserId: args.externalUserId,
        phone: args.phone,
        messages: [args.message],
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(existing._id, {
      messages: [...existing.messages, args.message].slice(-10),
      lastMessageAt: now,
      updatedAt: now,
    });
    return existing._id;
  },
});

export const deleteByBotPhone = internalMutation({
  args: { externalBotId: v.string(), phone: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("botConversations")
      .withIndex("by_bot_phone", (q) =>
        q.eq("externalBotId", args.externalBotId).eq("phone", args.phone),
      )
      .unique();
    if (!existing) return null;
    await ctx.db.delete(existing._id);
    return existing._id;
  },
});

export const deleteAllByUser = internalMutation({
  args: { externalUserId: v.string() },
  handler: async (ctx, args) => {
    // botConversations indexed by_user_updated = [externalUserId, updatedAt]
    const conversations = await ctx.db
      .query("botConversations")
      .withIndex("by_user_updated", (q) => q.eq("externalUserId", args.externalUserId))
      .collect();
    for (const c of conversations) {
      await ctx.db.delete(c._id);
    }

    // botEvents indexed by_user_occurred = [externalUserId, occurredAt]
    const events = await ctx.db
      .query("botEvents")
      .withIndex("by_user_occurred", (q) => q.eq("externalUserId", args.externalUserId))
      .collect();
    for (const e of events) {
      await ctx.db.delete(e._id);
    }

    return {
      conversations: conversations.length,
      events: events.length,
    };
  },
});

export const recordEvent = internalMutation({
  args: {
    eventId: v.string(),
    type: v.string(),
    externalUserId: v.string(),
    aggregateId: v.string(),
    payload: v.any(),
    occurredAt: v.number(),
  },
  handler: async (ctx, args) => {
    const duplicate = await ctx.db
      .query("botEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .unique();
    if (duplicate) return duplicate._id;
    return await ctx.db.insert("botEvents", args);
  },
});
