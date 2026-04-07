import { LinearLayout } from "@/components/layout/LinearLayout";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LinearLayout>{children}</LinearLayout>;
}
