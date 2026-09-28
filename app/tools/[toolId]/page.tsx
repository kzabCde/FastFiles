import { notFound } from "next/navigation";
import StandaloneToolPage from "@/components/StandaloneToolPage";
import { ALL_TOOLS } from "@/lib/tools";

export function generateStaticParams() {
  return ALL_TOOLS.map((tool) => ({ toolId: tool.id }));
}

export default async function ToolPage({ params }: { params: Promise<{ toolId: string }> }) {
  const { toolId } = await params;
  const tool = ALL_TOOLS.find((item) => item.id === toolId);
  if (!tool) notFound();
  return <StandaloneToolPage tool={tool} />;
}
