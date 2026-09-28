import { describe, expect, it } from "vitest";
import { addLogoToSvg } from "../../lib/qr-tools";

describe("QR SVG logo composition", () => {
  it("embeds the logo inside the QR viewBox", () => {
    const svg = '<svg viewBox="0 0 100 100"><path d="M0 0h100v100z"/></svg>';
    const output = addLogoToSvg(svg, "data:image/png;base64,AAAA", 20);
    expect(output).toContain('<image href="data:image/png;base64,AAAA"');
    expect(output).toContain('<rect');
    expect(output.endsWith("</svg>")).toBe(true);
  });
});
