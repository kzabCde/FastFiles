export type ToolId =
  | "merge-pdf"
  | "compress-pdf"
  | "organize-pdf"
  | "rotate-pdf"
  | "split-pdf"
  | "page-numbers"
  | "pdf-metadata"
  | "pdf-text"
  | "pdf-to-html"
  | "html-to-pdf"
  | "images-to-pdf"
  | "pdf-to-images"
  | "image-convert"
  | "image-resize"
  | "image-compress"
  | "watermark"
  | "pdf-sign";

export type FileKind = "pdf" | "image" | "html" | "mixed" | "unsupported";

export type ToolDefinition = {
  id: ToolId;
  label: string;
  thai: string;
  short: string;
  accepts: Array<"pdf" | "image" | "html">;
  aliases: string[];
  multiple?: boolean;
  hidden?: boolean;
};

const LEGACY_IMAGE_TOOLS: ToolDefinition[] = [
  { id: "image-resize", label: "Resize Image", thai: "ปรับขนาดรูป", short: "RESIZE", accepts: ["image"], multiple: true, hidden: true, aliases: ["resize image", "make image smaller", "ปรับขนาดรูป", "ลดขนาดรูป"] },
  { id: "image-compress", label: "Compress Image", thai: "บีบอัดรูป", short: "COMPRESS", accepts: ["image"], multiple: true, hidden: true, aliases: ["compress image", "make image smaller", "reduce image size", "บีบอัดรูป", "ลดไฟล์รูป"] },
];

export const TOOLS: ToolDefinition[] = [
  { id: "merge-pdf", label: "Merge PDF", thai: "รวม PDF", short: "MERGE", accepts: ["pdf"], multiple: true, aliases: ["merge pdf", "combine pdf", "join pdf", "รวม pdf", "รวมไฟล์ pdf"] },
  { id: "compress-pdf", label: "Compress Scanned PDF", thai: "บีบอัด PDF สแกน", short: "COMPRESS PDF", accepts: ["pdf"], aliases: ["compress pdf", "reduce pdf size", "small pdf", "บีบอัด pdf", "ลดขนาด pdf", "pdf สแกน"] },
  { id: "organize-pdf", label: "Organize PDF", thai: "จัดหน้า PDF", short: "ORGANIZE", accepts: ["pdf"], aliases: ["organize pdf", "reorder pages", "delete page", "duplicate page", "rotate page", "จัดหน้า pdf", "เรียงหน้า"] },
  { id: "rotate-pdf", label: "Rotate PDF", thai: "หมุน PDF", short: "ROTATE", accepts: ["pdf"], aliases: ["rotate pdf", "flip pdf", "turn pdf", "landscape", "portrait", "หมุน pdf", "พลิก pdf", "หมุนหน้า"] },
  { id: "split-pdf", label: "Split / Extract PDF", thai: "แยก / ดึงหน้า PDF", short: "SPLIT", accepts: ["pdf"], aliases: ["split pdf", "extract pages", "separate pdf", "แยก pdf", "ดึงหน้า pdf"] },
  { id: "page-numbers", label: "Add Page Numbers", thai: "ใส่เลขหน้า PDF", short: "NUMBER", accepts: ["pdf"], aliases: ["page numbers", "number pdf", "add page number", "เลขหน้า", "ใส่เลขหน้า pdf"] },
  { id: "pdf-metadata", label: "PDF Metadata", thai: "ข้อมูล PDF", short: "METADATA", accepts: ["pdf"], aliases: ["pdf metadata", "document info", "remove metadata", "ข้อมูล pdf", "ลบ metadata"] },
  { id: "pdf-text", label: "Extract PDF Text", thai: "ดึงข้อความจาก PDF", short: "PDF → TEXT", accepts: ["pdf"], aliases: ["extract pdf text", "pdf to text", "pdf to txt", "copy pdf text", "ดึงข้อความ pdf", "pdf เป็นข้อความ"] },
  { id: "pdf-to-html", label: "PDF to HTML", thai: "PDF เป็น HTML", short: "PDF → HTML", accepts: ["pdf"], aliases: ["pdf to html", "convert pdf to web page", "pdf webpage", "pdf เป็น html", "แปลง pdf เป็นเว็บ"] },
  { id: "html-to-pdf", label: "HTML to PDF", thai: "HTML เป็น PDF", short: "HTML → PDF", accepts: ["html"], aliases: ["html to pdf", "web page to pdf", "website to pdf", "html เป็น pdf", "เว็บเป็น pdf"] },
  { id: "images-to-pdf", label: "Images to PDF", thai: "รูปภาพเป็น PDF", short: "IMAGE → PDF", accepts: ["image"], multiple: true, aliases: ["jpg to pdf", "png to pdf", "images to pdf", "รูปเป็น pdf", "ภาพเป็น pdf"] },
  { id: "pdf-to-images", label: "PDF to Images", thai: "PDF เป็นรูปภาพ", short: "PDF → IMAGE", accepts: ["pdf"], aliases: ["pdf to jpg", "pdf to png", "pdf to image", "pdf เป็นรูป", "แปลง pdf เป็นรูป"] },
  { id: "image-convert", label: "Image Editor", thai: "แก้ไขรูปภาพ", short: "IMAGE EDIT", accepts: ["image"], multiple: true, aliases: ["image editor", "convert image", "resize image", "compress image", "crop image", "jpg to webp", "png to jpg", "avif", "แก้ไขรูปภาพ", "แปลงรูป", "ปรับขนาดรูป", "บีบอัดรูป", "ตัดรูป"] },
  { id: "watermark", label: "Watermark", thai: "ใส่ลายน้ำ", short: "WATERMARK", accepts: ["pdf", "image"], aliases: ["watermark pdf", "watermark image", "add watermark", "image watermark", "ลายน้ำ", "ใส่ลายน้ำ", "ลายน้ำรูป"] },
  { id: "pdf-sign", label: "Sign PDF", thai: "เซ็นเอกสาร PDF", short: "SIGN", accepts: ["pdf"], aliases: ["sign pdf", "digital signature", "e-sign", "esign", "เซ็น pdf", "ลายเซ็น", "เซ็นเอกสาร", "ลงลายเซ็น"] },
];

export const ALL_TOOLS: ToolDefinition[] = [...TOOLS, ...LEGACY_IMAGE_TOOLS];

export type ToolCategory = {
  key: string;
  en: string;
  th: string;
  toolIds: ToolId[];
};

export const TOOL_CATEGORIES: ToolCategory[] = [
  { key: "edit", en: "Edit & Organize", th: "แก้ไขและจัดการ", toolIds: ["merge-pdf", "compress-pdf", "organize-pdf", "rotate-pdf", "split-pdf", "image-convert"] },
  { key: "convert", en: "Convert", th: "แปลงไฟล์", toolIds: ["images-to-pdf", "pdf-to-images", "html-to-pdf", "pdf-to-html"] },
  { key: "enhance", en: "Enhance", th: "เพิ่มเติม", toolIds: ["page-numbers", "watermark", "pdf-sign", "pdf-text", "pdf-metadata"] },
];

export function kindOf(file: File): "pdf" | "image" | "html" | "unsupported" {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) || /\.(jpe?g|png|webp|avif)$/i.test(name)) return "image";
  if (file.type === "text/html" || /\.html?$/i.test(name)) return "html";
  return "unsupported";
}

export function groupKind(files: File[]): FileKind {
  if (!files.length) return "unsupported";
  const kinds = new Set(files.map(kindOf));
  if (kinds.has("unsupported")) return "unsupported";
  if (kinds.size > 1) return "mixed";
  return kinds.values().next().value ?? "unsupported";
}

export function toolsFor(files: File[]): ToolDefinition[] {
  const kind = groupKind(files);
  if (kind === "mixed" || kind === "unsupported") return [];
  const count = files.length;
  return TOOLS.filter((tool) => {
    if (!tool.accepts.includes(kind)) return false;
    if (tool.id === "merge-pdf" && count < 2) return false;
    if (kind === "pdf" && count > 1 && tool.id !== "merge-pdf") return false;
    return true;
  });
}

export function searchTools(query: string): ToolDefinition[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return TOOLS;
  return TOOLS.filter((tool) => {
    const haystack = [tool.label, tool.thai, tool.short, ...tool.aliases].join(" ").toLowerCase();
    return normalized.split(/\s+/).every((part) => haystack.includes(part));
  });
}
