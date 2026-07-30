import { describe, expect, it } from "vitest";
import { activeRunSubmissionMessage } from "../src/tui/submission.js";

describe("active-run prompt submission", () => {
  it("blocks a second ordinary message while Janet is running", () => {
    expect(activeRunSubmissionMessage(true)).toBe(
      "Janet is still working. Cancel the active run before sending another message.",
    );
  });

  it("allows ordinary messages while idle", () => {
    expect(activeRunSubmissionMessage(false)).toBeUndefined();
  });
});
