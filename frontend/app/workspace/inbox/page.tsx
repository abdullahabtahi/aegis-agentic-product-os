"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /workspace/inbox is no longer a standalone page.
 * The Approvals inbox now lives in the header notification bell (InboxDrawer).
 * Redirect to home so old bookmarks still land somewhere useful.
 */
export default function InboxPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/workspace");
  }, [router]);

  return null;
}
