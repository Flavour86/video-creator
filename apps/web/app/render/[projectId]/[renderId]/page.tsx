import { redirect } from "next/navigation";
import { isValidRenderId, isValidRenderProjectId } from "@/lib/render/routes";
import { RenderPageClient } from "../../RenderPageClient";

type RenderPathPageProps = {
  params: Promise<{
    projectId: string;
    renderId: string;
  }>;
};

export default async function RenderPathPage({ params }: RenderPathPageProps) {
  const { projectId, renderId } = await params;
  if (!isValidRenderProjectId(projectId) || !isValidRenderId(renderId)) {
    redirect("/");
  }
  return <RenderPageClient projectId={projectId} renderId={renderId} />;
}
