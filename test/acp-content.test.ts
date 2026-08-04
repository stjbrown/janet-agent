import { describe, expect, it } from "vitest";
import {
  promptToText,
  questionForm,
  questionFromSuspension,
} from "../src/acp/content.js";

describe("ACP content conversion", () => {
  it("combines text and resource links", () => {
    expect(
      promptToText([
        { type: "text", text: "Document this repository" },
        {
          type: "resource_link",
          name: "README",
          uri: "file:///project/README.md",
        },
      ]),
    ).toBe("Document this repository\n\nREADME — file:///project/README.md");
  });

  it("rejects prompt types Janet did not advertise", () => {
    expect(() =>
      promptToText([{ type: "image", data: "AA==", mimeType: "image/png" }]),
    ).toThrow(/does not support.*image/);
  });

  it("converts ask_user suspensions to single and multi-select forms", () => {
    const question = questionFromSuspension({
      toolCallId: "call-1",
      toolName: "ask_user",
      suspendPayload: {
        question: "Choose a strategy",
        selectionMode: "multi_select",
        options: [
          { label: "Safe", description: "Minimal edits" },
          { label: "Fast" },
        ],
      },
    });
    expect(question).toMatchObject({
      toolCallId: "call-1",
      question: "Choose a strategy",
      multi: true,
    });
    expect(questionForm(question!).properties?.answer).toMatchObject({
      type: "array",
      minItems: 1,
    });
  });
});
