import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Get cart items for a session
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const conversation = await db.conversation.findUnique({
    where: { sessionId },
    include: { cartItems: true },
  });

  if (!conversation) {
    return NextResponse.json({ items: [] });
  }

  return NextResponse.json({ items: conversation.cartItems });
}

// Add item to cart
export async function POST(request: NextRequest) {
  try {
    const { sessionId, partName, priceRange, category } = await request.json();

    if (!sessionId || !partName) {
      return NextResponse.json({ error: "sessionId and partName are required" }, { status: 400 });
    }

    // Get or create conversation
    let conversation = await db.conversation.findUnique({
      where: { sessionId },
    });

    if (!conversation) {
      conversation = await db.conversation.create({
        data: { sessionId },
      });
    }

    // Check if item already exists
    const existingItem = await db.cartItem.findFirst({
      where: {
        conversationId: conversation.id,
        partName,
      },
    });

    if (existingItem) {
      // Increment quantity
      const updated = await db.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: { increment: 1 } },
      });
      return NextResponse.json({ success: true, item: updated });
    }

    // Create new item
    const item = await db.cartItem.create({
      data: {
        conversationId: conversation.id,
        partName,
        priceRange: priceRange || "N/A",
        category: category || "Other",
      },
    });

    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error("Cart API error:", error);
    return NextResponse.json({ error: "Failed to add item to cart" }, { status: 500 });
  }
}

// Remove item from cart
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get("itemId");
    const sessionId = searchParams.get("sessionId");

    if (itemId) {
      await db.cartItem.delete({ where: { id: itemId } });
    } else if (sessionId) {
      const conversation = await db.conversation.findUnique({
        where: { sessionId },
      });
      if (conversation) {
        await db.cartItem.deleteMany({
          where: { conversationId: conversation.id },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cart delete error:", error);
    return NextResponse.json({ error: "Failed to remove item" }, { status: 500 });
  }
}

// Update quantity
export async function PUT(request: NextRequest) {
  try {
    const { itemId, quantity } = await request.json();

    if (!itemId || quantity < 1) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const item = await db.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });

    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error("Cart update error:", error);
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }
}
