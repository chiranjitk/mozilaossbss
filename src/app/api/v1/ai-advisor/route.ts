// =====================================================================
// AI ADVISOR API — chat with LLM using z-ai-web-dev-sdk
// Persists conversations in AiConversation table
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, created, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are Cryptsk AI Advisor, an expert assistant for an OSS/BSS + AAA/RADIUS Access Gateway platform.
You help network operators, ISP administrators, and support staff with:
- Subscriber management (creation, plans, lifecycle, troubleshooting)
- RADIUS/AAA configuration (authentication, accounting, CoA, disconnect)
- Network management (IPAM, DHCP, DNS, subnets)
- Billing and invoicing (invoice generation, payment processing, reconciliation)
- Monitoring (bandwidth, traffic, alerts, syslog, uptime)
- Operations (complaints, technicians, installations, inventory, incidents)
- Policy (bandwidth profiles, QoS, firewall, time access)
- Finance (revenue reports, collections, tax/GST)

Be concise, practical, and specific. When suggesting actions, mention which module/page to use.
If asked about specific subscriber data, recommend checking the Customer 360 page.
Keep responses under 200 words unless asked for detail.`;

// GET /api/v1/ai-advisor — list conversations
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("ai", "ai.advisor.use");
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId");

  if (conversationId) {
    const conv = await db.aiConversation.findFirst({
      where: { id: conversationId, tenantId: ctx.tenantId, userId: ctx.userId },
    });
    if (!conv) throw ApiError.notFound("Conversation", conversationId);
    return ok({
      ...conv,
      messages: conv.messages ? JSON.parse(conv.messages) : [],
    });
  }

  const conversations = await db.aiConversation.findMany({
    where: { tenantId: ctx.tenantId, userId: ctx.userId },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { id: true, title: true, type: true, status: true, createdAt: true, updatedAt: true },
  });

  return ok({ conversations });
});

const chatSchema = z.object({
  message: z.string().min(1, "Message is required").max(2000),
  conversationId: z.string().optional(),
});

// POST /api/v1/ai-advisor — send message and get AI response
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("ai", "ai.advisor.use");
  const body = await req.json();
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const { message, conversationId } = parsed.data;

  // Get or create conversation
  let conv;
  let messages: Array<{ role: string; content: string; timestamp: string }>;

  if (conversationId) {
    conv = await db.aiConversation.findFirst({
      where: { id: conversationId, tenantId: ctx.tenantId, userId: ctx.userId },
    });
    if (!conv) throw ApiError.notFound("Conversation", conversationId);
    messages = conv.messages ? JSON.parse(conv.messages) : [];
  } else {
    messages = [];
  }

  // Add user message
  const userMsg = { role: "user", content: message, timestamp: new Date().toISOString() };
  messages.push(userMsg as any);

  // Call the LLM
  let aiResponse: string;
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();

    // Build LLM messages (system + conversation history, limited to last 10 messages)
    const llmMessages = [
      { role: "assistant", content: SYSTEM_PROMPT },
      ...messages.slice(-10).map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
      })),
    ];

    const completion = await zai.chat.completions.create({
      messages: llmMessages as any,
      thinking: { type: "disabled" },
    });

    aiResponse = completion.choices[0]?.message?.content ?? "I apologize, but I couldn't generate a response. Please try again.";
  } catch (err) {
    console.error("[ai-advisor] LLM error:", err);
    aiResponse = "I'm currently unable to connect to the AI service. Please try again in a moment. In the meantime, you can check the relevant module pages directly.";
  }

  // Add AI response
  const aiMsg = { role: "assistant", content: aiResponse, timestamp: new Date().toISOString() };
  messages.push(aiMsg as any);

  // Save conversation
  if (conv) {
    conv = await db.aiConversation.update({
      where: { id: conv.id },
      data: {
        messages: JSON.stringify(messages),
        title: messages.length === 2 ? message.slice(0, 60) : conv.title,
        updatedAt: new Date(),
      },
    });
  } else {
    conv = await db.aiConversation.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        type: "advisor",
        title: message.slice(0, 60),
        messages: JSON.stringify(messages),
        status: "active",
      },
    });
  }

  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "ai.advisor.chat",
    module: "ai", resource: "AiConversation", resourceId: conv.id, requestId,
    message: `AI Advisor chat: ${message.slice(0, 50)}...`,
  });

  return created({
    conversationId: conv.id,
    message: aiResponse,
    messages,
  }, requestId);
});
