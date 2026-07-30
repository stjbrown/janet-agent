import { describe, expect, it } from "vitest";
import {
  forgetModelFromSettings,
  type JanetSettings,
} from "../src/onboarding/settings.js";

describe("saved model settings", () => {
  it("forgets a custom model and clears it as the default", () => {
    const settings: JanetSettings = {
      defaultModelId: "vertex/sonnet-5",
      customModels: [
        "vertex/sonnet-5",
        "vertex/claude-opus-5",
      ],
    };

    expect(forgetModelFromSettings(settings, "vertex/sonnet-5")).toBe(true);
    expect(settings).toEqual({
      customModels: ["vertex/claude-opus-5"],
    });
  });

  it("leaves settings unchanged when the model was not saved", () => {
    const settings: JanetSettings = {
      defaultModelId: "vertex/claude-opus-5",
      customModels: ["vertex/claude-opus-5"],
    };

    expect(forgetModelFromSettings(settings, "vertex/missing")).toBe(false);
    expect(settings).toEqual({
      defaultModelId: "vertex/claude-opus-5",
      customModels: ["vertex/claude-opus-5"],
    });
  });
});
