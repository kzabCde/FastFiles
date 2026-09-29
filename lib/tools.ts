export type ToolId =
  | "merge-pdf"
  | "organize-pdf"
  | "split-pdf"
  | "page-numbers"
  | "pdf-metadata"
  | "pdf-text"
  | "images-to-pdf"
  | "pdf-to-images"
  | "image-convert"
  | "image-resize"
  | "image-compress"
  | "watermark";

export type FileKind = "pdf" | "image" | "mixed" | "unsupported";

export type ToolDefinition = {
  id: ToolId;
  label: string;
  thai: string;
  short: string;
  accepts: Array<"pdf" | "image">;
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
  { id: "organize-pdf", label: "Organize PDF", thai: "จัดหน้า PDF", short: "ORGANIZE", accepts: ["pdf"], aliases: ["organize pdf", "reorder pages", "delete page", "duplicate page", "rotate page", "จัดหน้า pdf", "เรียงหน้า"] },
  { id: "split-pdf", label: "Split / Extract PDF", thai: "แยก / ดึงหน้า PDF", short: "SPLIT", accepts: ["pdf"], aliases: ["split pdf", "extract pages", "separate pdf", "แยก pdf", "ดึงหน้า pdf"] },
  { id: "page-numbers", label: "Add Page Numbers", thai: "ใส่เลขหน้า PDF", short: "NUMBER", accepts: ["pdf"], aliases: ["page numbers", "number pdf", "add page number", "เลขหน้า", "ใส่เลขหน้า pdf"] },
  { id: "pdf-metadata", label: "PDF Metadata", thai: "ข้อมูล PDF", short: "METADATA", accepts: ["pdf"], aliases: ["pdf metadata", "document info", "remove metadata", "ข้อมูล pdf", "ลบ metadata"] },
  { id: "pdf-text", label: "Extract PDF Text", thai: "ดึงข้อความจาก PDF", short: "PDF → TEXT", accepts: ["pdf"], aliases: ["extract pdf text", "pdf to text", "pdf to txt", "copy pdf text", "ดึงข้อความ pdf", "pdf เป็นข้อความ"] },
  { id: "images-to-pdf", label: "Images to PDF", thai: "รูปภาพเป็น PDF", short: "IMAGE → PDF", accepts: ["image"], multiple: true, aliases: ["jpg to pdf", "png to pdf", "images to pdf", "รูปเป็น pdf", "ภาพเป็น pdf"] },
  { id: "pdf-to-images", label: "PDF to Images", thai: "PDF เป็นรูปภาพ", short: "PDF → IMAGE", accepts: ["pdf"], aliases: ["pdf to jpg", "pdf to png", "pdf to image", "pdf เป็นรูป", "แปลง pdf เป็นรูป"] },
  { id: "image-convert", label: "Image Editor", thai: "แก้ไขรูปภาพ", short: "IMAGE EDIT", accepts: ["image"], multiple: true, aliases: ["image editor", "convert image", "resize image", "compress image", "crop image", "jpg to webp", "png to jpg", "avif", "แก้ไขรูปภาพ", "แปลงรูป", "ปรับขนาดรูป", "บีบอัดรูป", "ตัดรูป"] },
  { id: "watermark", label: "Watermark", thai: "ใส่ลายน้ำ", short: "WATERMARK", accepts: ["pdf", "image"], aliases: ["watermark pdf", "watermark image", "add watermark", "image watermark", "ลายน้ำ", "ใส่ลายน้ำ", "ลายน้ำรูป"] },
];

export const ALL_TOOLS: ToolDefinition[] = [...TOOLS, ...LEGACY_IMAGE_TOOLS];

export function kindOf(file: File): "pdf" | "image" | "unsupported" {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) || /\.(jpe?g|png|webp|avif)$/i.test(name)) return "image";
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
