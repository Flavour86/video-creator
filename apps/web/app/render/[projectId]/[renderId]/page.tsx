import { redirect } from "next/navigation";

type RenderPathPageProps = {
  params: Promise<{
    projectId: string;
    renderId: string;
  }>;
};

export default async function RenderPathPage({ params }: RenderPathPageProps) {
  const resolvedParams = await params;
  redirect(`/render?projectId=${encodeURIComponent(resolvedParams.projectId)}&job=${encodeURIComponent(resolvedParams.renderId)}`);
}
