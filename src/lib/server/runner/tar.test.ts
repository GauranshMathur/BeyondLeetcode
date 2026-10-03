import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createTar } from "./tar";

describe("createTar", () => {
  it("is a tar that the system tar lists and extracts intact", () => {
    const tar = createTar([
      { path: "build/main.py", content: 'print("héllo")\n' },
      { path: "tests/0.in", content: "" },
    ]);

    const list = spawnSync("tar", ["-tvf", "-"], {
      input: tar,
      encoding: "utf8",
    });
    expect(list.status).toBe(0);
    expect(list.stdout).toContain("build/main.py");
    expect(list.stdout).toContain("tests/0.in");

    const cat = spawnSync("tar", ["-xOf", "-", "build/main.py"], {
      input: tar,
      encoding: "utf8",
    });
    expect(cat.stdout).toBe('print("héllo")\n');
  });

  it("rejects a path that does not fit a ustar name", () => {
    expect(() => createTar([{ path: "a".repeat(101), content: "" }])).toThrow(
      /too long/,
    );
  });
});
