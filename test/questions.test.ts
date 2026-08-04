import { describe, expect, it } from "vitest";
import {
  formatQuestion,
  resolveQuestionAnswer,
} from "../src/agent/questions.js";

const options = [
  { label: "Conservative", description: "Small changes" },
  { label: "Aggressive", description: "Larger rewrite" },
];

describe("shared Janet questions", () => {
  it("resolves numbers, labels, prefixes, and multi-select answers", () => {
    expect(resolveQuestionAnswer({ options, multi: false }, "2")).toBe("Aggressive");
    expect(resolveQuestionAnswer({ options, multi: false }, "conservative")).toBe(
      "Conservative",
    );
    expect(resolveQuestionAnswer({ options, multi: false }, "agg")).toBe("Aggressive");
    expect(resolveQuestionAnswer({ options, multi: true }, "1, aggressive")).toEqual([
      "Conservative",
      "Aggressive",
    ]);
  });

  it("rejects blank or unknown answers", () => {
    expect(resolveQuestionAnswer({ multi: false }, "   ")).toBeUndefined();
    expect(resolveQuestionAnswer({ options, multi: false }, "unknown")).toBeUndefined();
  });

  it("formats a portable conversational fallback", () => {
    expect(formatQuestion("How should I proceed?", options)).toContain(
      "1. Conservative — Small changes",
    );
    expect(formatQuestion("Why?", undefined)).toContain("Reply with your answer");
  });
});
