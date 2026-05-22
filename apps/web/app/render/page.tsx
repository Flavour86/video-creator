import { redirect } from "next/navigation";
import { firstSearchValue, isValidRenderId, isValidRenderProjectId, renderRoute } from "@/lib/render/routes";

type RenderPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RenderPage({ searchParams }: RenderPageProps) {
  const params = await searchParams;
  const projectId = firstSearchValue(params?.projectId ?? params?.project);
  const renderId = firstSearchValue(params?.job ?? params?.renderId);
  if (isValidRenderProjectId(projectId) && isValidRenderId(renderId)) {
    redirect(renderRoute(projectId, renderId));
  }
  redirect("/");
}
