import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Playwright viewports are whole pixels, so the e2e suite cannot reach 767.5 CSS px (browser zoom), and the
// page cannot be framed to get there (frame-ancestors 'none'). This holds the written breakpoints instead.
const files = [
  "+page.svelte",
  "ProblemWorkspace.svelte",
  "ResultsPanel.svelte",
];

describe("the Problem screen breakpoints", () => {
  for (const file of files) {
    const media = [
      ...readFileSync(new URL(file, import.meta.url), "utf8").matchAll(
        /@media[^{]*/g,
      ),
    ].map((m) => m[0]);

    it(`${file} starts its phone layout at 767.98px, as every other screen does`, () => {
      for (const query of media) expect(query).not.toMatch(/\b(767|768)px/);
    });
  }

  it("the middle layout starts exactly where the phone layout stops", () => {
    const css = readFileSync(
      new URL("ProblemWorkspace.svelte", import.meta.url),
      "utf8",
    );
    expect(css).toContain("@media (max-width: 767.98px)");
    expect(css).toContain("@media (width > 767.98px) and (width <= 900px)");
  });
});
