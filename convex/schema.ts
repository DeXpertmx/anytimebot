import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const message = v.object({
  role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
  content: v.string(),
  timestamp: v.number(),
});

export default defineSchema({
  botConversations: defineTable({
    externalBotId: v.string(),
    externalUserId: v.string(),
    phone: v.string(),
    messages: v.array(message),
    lastMessageAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_bot_phone", ["externalBotId", "phone"])
    .index("by_user_updated", ["externalUserId", "updatedAt"]),

  botEvents: defineTable({
    eventId: v.string(),
    type: v.string(),
    externalUserId: v.string(),
    aggregateId: v.string(),
    payload: v.any(),
    occurredAt: v.number(),
  })
    .index("by_event_id", ["eventId"])
    .index("by_user_occurred", ["externalUserId", "occurredAt"]),
});
