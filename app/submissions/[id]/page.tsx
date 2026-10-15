import { ResultsPage } from "@/components/ResultsPage";

export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResultsPage id={id} />;
}
