import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const SYSTEM_PROMPT = `You are Wasit AI, an expert automotive diagnostics assistant for the PartsBridge marketplace in Qatar.

Your job:
1. Listen to the customer's car problem or symptoms
2. Diagnose the likely issue clearly and simply
3. Recommend the specific parts they need to buy
4. Give safety advice if the issue is urgent
5. Ask about mileage when relevant to suggest maintenance

Always respond in a friendly, professional tone. Keep responses concise — this is a mobile chat.

**IMPORTANT: Format ALL your responses using Markdown:**
- Use **bold** for important terms and part names
- Use headers (## or ###) for sections
- Use bullet points with emojis for lists
- Use \`inline code\` for technical terms or measurements
- Use horizontal rules (---) to separate sections
- Use emojis throughout to make it friendly

**For parts recommendations, use this EXACT format on its own line:**
[PART: part_name | price_range | category]

Example: [PART: Brake Pads (Front) | QAR 150-350 | Brakes]

Categories available: Engine, Brakes, Electrical, Suspension, Transmission, Exhaust, Cooling, Filters

**If the problem sounds dangerous (brake failure, steering issues, smoke), start with:**
⚠️ **URGENT: This needs immediate attention!**

**When asking follow-up questions, use this format:**

**What kind of noise is it?**
- 🔊 Knocking/tapping sound?
- 🐍 Hissing or whistling?
- 💥 Grinding or rattling?

**When does it happen?**
- When starting the car?
- While idling?
- When accelerating?

**Mileage-based maintenance reminders:**
- 10,000 km: Oil & filter change
- 20,000 km: Air filter, cabin filter
- 40,000 km: Spark plugs, fuel filter, brake fluid
- 60,000 km: Timing belt check, coolant flush
- 80,000 km: Transmission fluid, full brake inspection

Always end with: "Want me to find these parts in the PartsBridge marketplace? 🔧"

Respond in the same language the user writes in (Arabic or English).`;

// Rate limiting configuration
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

async function callOpenAI(messages: Array<{ role: string; content: string }>) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Wasit AI Chatbot"
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 2048
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "Sorry, I couldn't process that.";
}

async function checkRateLimit(sessionId: string): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const now = new Date();
  let rateLimit = await db.rateLimit.findUnique({ where: { sessionId } });

  if (!rateLimit || rateLimit.resetAt < now) {
    const resetAt = new Date(now.getTime() + RATE_LIMIT_WINDOW_MS);
    rateLimit = await db.rateLimit.create({
      data: { sessionId, count: 0, resetAt },
    });
  }

  const remaining = RATE_LIMIT_MAX - rateLimit.count;
  if (rateLimit.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: rateLimit.resetAt };
  }

  return { allowed: true, remaining: remaining - 1, resetAt: rateLimit.resetAt };
}

async function incrementRateLimit(sessionId: string) {
  await db.rateLimit.update({
    where: { sessionId },
    data: { count: { increment: 1 } },
  });
}

async function getOrCreateConversation(sessionId: string, mileage?: string) {
  let conversation = await db.conversation.findUnique({
    where: { sessionId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!conversation) {
    conversation = await db.conversation.create({
      data: { sessionId, mileage: mileage || null },
      include: { messages: true },
    });
  } else if (mileage && conversation.mileage !== mileage) {
    conversation = await db.conversation.update({
      where: { sessionId },
      data: { mileage },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  }

  return conversation;
}

async function saveMessage(conversationId: string, role: string, content: string, thinking?: string) {
  return db.message.create({
    data: { conversationId, role, content, thinking },
  });
}

function buildMessages(history: Array<{ role: string; content: string }>, systemPrompt: string) {
  return [
    { role: "assistant", content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId, message, mileage, enableThinking, stream } = await request.json();

    if (!message || !sessionId) {
      return NextResponse.json({ error: "Message and sessionId are required" }, { status: 400 });
    }

    const rateLimitCheck = await checkRateLimit(sessionId);
    if (!rateLimitCheck.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", message: "You've reached the message limit. Please wait and try again later." },
        { status: 429 }
      );
    }

    const conversation = await getOrCreateConversation(sessionId, mileage);

    const fullSystemPrompt = SYSTEM_PROMPT + (conversation.mileage ? `\n\nUser's current mileage: ${conversation.mileage} km` : "");
    const history = conversation.messages.map((m) => ({ role: m.role, content: m.content }));
    const messages = buildMessages([...history, { role: "user", content: message }], fullSystemPrompt);

    await saveMessage(conversation.id, "user", message);

    if (stream) {
      const encoder = new TextEncoder();
      const streamResponse = new ReadableStream({
        async start(controller) {
          try {
            const fullContent = await callOpenAI(messages);

            await saveMessage(conversation.id, "assistant", fullContent);
            await incrementRateLimit(sessionId);

            const words = fullContent.split(" ");
            let currentText = "";

            for (let i = 0; i < words.length; i++) {
              currentText += (i > 0 ? " " : "") + words[i];
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "content", content: currentText, done: i === words.length - 1 })}\n\n`)
              );
              await new Promise((r) => setTimeout(r, 15));
            }

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", remaining: rateLimitCheck.remaining })}\n\n`));
            controller.close();
          } catch (error) {
            console.error("Stream error:", error);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: "An error occurred" })}\n\n`));
            controller.close();
          }
        },
      });

      return new Response(streamResponse, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const aiResponse = await callOpenAI(messages);

    await saveMessage(conversation.id, "assistant", aiResponse);
    await incrementRateLimit(sessionId);

    return NextResponse.json({
      success: true,
      response: aiResponse,
      remaining: rateLimitCheck.remaining,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    const errorMessage = error instanceof Error ? error.message : "An error occurred";
    console.error("Error message:", errorMessage);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const conversation = await db.conversation.findUnique({
    where: { sessionId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!conversation) {
    return NextResponse.json({ messages: [], mileage: null });
  }

  return NextResponse.json({
    messages: conversation.messages,
    mileage: conversation.mileage,
  });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  await db.conversation.deleteMany({ where: { sessionId } });
  await db.rateLimit.deleteMany({ where: { sessionId } });

  return NextResponse.json({ success: true, message: "Conversation cleared" });
}
