import { beforeEach, describe, expect, it, vi } from "vitest";

const getSpacesMock = vi.fn();
const ensureSpaceMock = vi.fn();

vi.mock("@/src/lib/memoryIntelligence", () => ({
  getSpaces: getSpacesMock,
  ensureSpace: ensureSpaceMock,
}));

describe("/api/spaces", () => {
  beforeEach(() => {
    getSpacesMock.mockReset();
    ensureSpaceMock.mockReset();
  });

  it("returns a 400 when userId is missing", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/spaces"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("userId is required");
  });

  it("returns spaces for a user", async () => {
    getSpacesMock.mockResolvedValue([
      {
        id: "space-1",
        user_id: "user-1",
        name: "General",
        description: "Default",
        created_at: "2026-06-23T00:00:00.000Z",
        updated_at: "2026-06-23T00:00:00.000Z",
      },
    ]);

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/spaces?userId=user-1")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.spaces).toHaveLength(1);
    expect(body.spaces[0].name).toBe("General");
  });
});
