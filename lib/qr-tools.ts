export function addLogoToSvg(svgMarkup: string, logoDataUrl: string, logoPercent: number) {
  const viewBox = svgMarkup.match(/viewBox=["']([^"']+)["']/i)?.[1]?.trim().split(/\s+/).map(Number);
  if (!viewBox || viewBox.length !== 4 || viewBox.some((value) => !Number.isFinite(value))) return svgMarkup;
  const [minX, minY, width, height] = viewBox;
  const ratio = Math.min(0.3, Math.max(0.1, logoPercent / 100));
  const logoWidth = width * ratio;
  const logoHeight = height * ratio;
  const padding = Math.max(width * 0.01, logoWidth * 0.1);
  const x = minX + (width - logoWidth) / 2;
  const y = minY + (height - logoHeight) / 2;
  const overlay = `<rect x="${x - padding}" y="${y - padding}" width="${logoWidth + padding * 2}" height="${logoHeight + padding * 2}" rx="${padding * 0.35}" fill="#fff"/><image href="${logoDataUrl}" x="${x}" y="${y}" width="${logoWidth}" height="${logoHeight}" preserveAspectRatio="xMidYMid meet"/>`;
  return svgMarkup.replace(/<\/svg>\s*$/i, `${overlay}</svg>`);
}
