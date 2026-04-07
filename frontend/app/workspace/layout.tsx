import { GlassmorphicLayout } from "@/components/layout/GlassmorphicLayout";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <GlassmorphicLayout>{children}</GlassmorphicLayout>;
}
