import { NextResponse } from "next/server";
import { ensureSpace, getSpaces } from "@/src/lib/memoryIntelligence";
import { getErrorMessage, isSchemaMissingError } from "@/src/lib/apiErrors";

const FALLBACK_SPACES = [
  {
    id: "setup-general",
    user_id: "",
    name: "General",
    description: "Apply the database migration to enable spaces.",
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  },
];

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const spaces = await getSpaces(userId);
    return NextResponse.json({ spaces, setupRequired: false });
  } catch (err) {
    if (isSchemaMissingError(err)) {
      return NextResponse.json({
        spaces: FALLBACK_SPACES,
        setupRequired: true,
        setupMessage:
          "Apply supabase/migrations/20260623000000_memory_intelligence_layer.sql to enable memory intelligence features.",
      });
    }

    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId, name, description } = await req.json();

    if (!userId || !name) {
      return NextResponse.json(
        { error: "userId and name are required" },
        { status: 400 }
      );
    }

    const space = await ensureSpace(userId, name, description ?? null);
    return NextResponse.json({ space }, { status: 201 });
  } catch (err) {
    if (isSchemaMissingError(err)) {
      return NextResponse.json(
        {
          error:
            "Database migration is required before creating spaces. Apply supabase/migrations/20260623000000_memory_intelligence_layer.sql.",
          setupRequired: true,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
