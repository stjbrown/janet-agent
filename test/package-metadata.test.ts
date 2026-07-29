import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("published package metadata", () => {
  it("uses the new prerelease identity and exact skills build dependency", () => {
    const metadata = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as {
      name: string;
      version: string;
      bin: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(metadata.name).toBe("janet-agent");
    expect(metadata.version).toBe("0.1.0-beta.1");
    expect(metadata.bin.janet).toBe(metadata.bin.ding);
    expect(metadata.devDependencies["@stjbrown/agent-knowledge-skills"]).toBe("0.2.0");
  });

  it("pins runtime dependencies for reproducible global and npx installs", () => {
    const metadata = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { dependencies: Record<string, string> };

    for (const [name, version] of Object.entries(metadata.dependencies)) {
      expect(version, `${name} must use an exact version`).toMatch(
        /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/,
      );
    }
  });
});
