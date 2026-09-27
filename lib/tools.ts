export type ToolId =
  | "merge-pdf"
  | "organize-pdf"
  | "split-pdf"
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
};

export const TOOLS: ToolDefinition[] = [
  {
    id: "merge-pdf",
    label: "Merge PDF",
    thai: "รวม PDF",
    short: "MERGE",
    accepts: ["pdf"],
    aliases: ["merge pdf", "combine pdf", "join pdf", "รวม pdf", "รวมไฟล์ pdf"],
  },
  {
    id: "organize-pdf",
    label: "Organize PDF",
    thai: "จัดหน้า PDF",
    short: "ORGANIZE",
    accepts: ["pdf"],
    aliases: ["organize pdf", "reorder pages", "delete page", "rotate page", "จัดหน้า pdf", "เรียงหน้า"],
  },
  {
    id: "split-pdf",
    label: "Split / Extract PDF",
    thai: "แยก / ดึงหน้า PDF",
    short: "SPLIT",
    accepts: ["pdf"],
    aliases: ["split pdf", "extract pages", "separate pdf", "แยก pdf", "ดึงหน้า pdf"],
  },
  {
    id: "images-to-pdf",
    label: "Images to PDF",
    thai: "รูปภาพเป็น PDF",
    short: "IMAGE → PDF",
    accepts: ["image"],
    aliases: ["jpg to pdf", "png to pdf", "images to pdf", "รูปเป็น pdf", "ภาพเป็น pdf"],
  },
  {
    id: "pdf-to-images",
    label: "PDF to Images",
    thai: "PDF เป็นรูปภาพ",
    short: "PDF → IMAGE",
    accepts: ["pdf"],
    aliases: ["pdf to jpg", "pdf to png", "pdf to image", "pdf เป็นรูป", "แปลง pdf เป็นรูป"],
  },
  {
    id: "image-convert",
    label: "Image Converter",
    thai: "แปลงไฟล์รูป",
    short: "CONVERT",
    accepts: ["image"],
    aliases: ["jpg to webp", "png to jpg", "convert image", "แปลงรูป", "แปลงไฟล์ภาพ"],
  },
  {
    id: "image-resize",
    label: "Resize Image",
    thai: "ปรับขนาดรูป",
    short: "RESIZE",
    accepts: ["image"],
    aliases: ["resize image", "make image smaller", "ปรับขนาดรูป", "ลดขนาดรูป"],
  },
  {
    id: "image-compress",
    label: "Compress Image",
    thai: "บีบอัดรูป",
    short: "COMPRESS",
    accepts: ["image"],
    aliases: ["compress image", "make image smaller", "reduce image size", "บีบอัดรูป", "ลดไฟล์รูป"],
  },
  {
    id: "watermark",
    label: "Watermark",
    thai: "ใส่ลายน้ำ",
    short: "WATERMARK",
    accepts: ["pdf", "image"],
    aliases: ["watermark pdf", "watermark image", "add watermark", "ลายน้ำ", "ใส่ลายน้ำ"],
  },
];

export function kindOf(file: File): "pdf" | "image" | "unsupported" {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("image/")) return "image";
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
  if (kind === "pdf") return TOOLS.filter((tool) => tool.accepts.includes("pdf"));
  if (kind === "image") return TOOLS.filter((tool) => tool.accepts.includes("image"));
  return TOOLS;
}

export function searchTools(query: string): ToolDefinition[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return TOOLS;
  return TOOLS.filter((tool) => {
    const haystack = [tool.label, tool.thai, tool.short, ...tool.aliases].join(" ").toLowerCase();
    return normalized.split(/\s+/).every((part) => haystack.includes(part));
  });
}
