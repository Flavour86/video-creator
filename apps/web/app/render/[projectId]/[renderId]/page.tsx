import { redirect } from "next/navigation";

type RenderPathPageProps = {
  params: {
    projectId: string;
    renderId: string;
  };
};

export default function RenderPathPage({ params }: RenderPathPageProps) {
  redirect(`/render?projectId=${encodeURIComponent(params.projectId)}&job=${encodeURIComponent(params.renderId)}`);
}
