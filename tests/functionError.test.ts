import { describe, expect, it } from "vitest";
import { explainFunctionError } from "../src/lib/supabaseClient";

const resp = (status: number, body: unknown) =>
  ({ status, json: async () => body }) as unknown as Response;

describe("explainFunctionError", () => {
  it("shows the server's own message instead of the generic one", async () => {
    const e = await explainFunctionError({ context: resp(500, { error: "GEMINI_API_KEY غير مُعرَّف على الخادم" }) });
    expect(e.message).toBe("GEMINI_API_KEY غير مُعرَّف على الخادم");
  });
  it("joins error and details, and handles the platform's JWT message", async () => {
    expect((await explainFunctionError({ context: resp(502, { error: "فشل الاتصال بـ Gemini", details: "quota" }) })).message).toBe(
      "فشل الاتصال بـ Gemini — quota"
    );
    expect((await explainFunctionError({ context: resp(401, { code: 401, message: "Invalid JWT" }) })).message).toBe("Invalid JWT");
  });
  it("falls back to the HTTP status when the body is not JSON", async () => {
    const bad = { status: 503, json: async () => { throw new Error("x"); } } as unknown as Response;
    expect((await explainFunctionError({ context: bad })).message).toBe("فشل استدعاء الدالة (HTTP 503)");
  });
  it("passes ordinary errors through and never throws on junk", async () => {
    expect((await explainFunctionError(new Error("شبكة"))).message).toBe("شبكة");
    expect((await explainFunctionError(null)).message).toBe("null");
  });
  it("truncates very long server messages", async () => {
    const e = await explainFunctionError({ context: resp(502, { details: "x".repeat(2000) }) });
    expect(e.message.length).toBe(300);
  });
});
