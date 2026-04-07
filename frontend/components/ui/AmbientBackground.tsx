"use client";

/**
 * Ambient gradient blobs for glassmorphic background.
 * Renders soft, animated radial gradient blobs behind content.
 * Place as a sibling before main content inside the layout wrapper.
 */
export function AmbientBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Primary indigo blob — top-left */}
      <div
        className="absolute -left-[15%] -top-[10%] h-[55vh] w-[55vh] rounded-full opacity-40 blur-[120px]"
        style={{ background: "radial-gradient(circle, #818cf8 0%, #3b2bee 50%, transparent 70%)" }}
      />
      {/* Secondary violet blob — bottom-right */}
      <div
        className="absolute -bottom-[10%] -right-[10%] h-[50vh] w-[50vh] rounded-full opacity-30 blur-[100px]"
        style={{ background: "radial-gradient(circle, #a78bfa 0%, #6366f1 50%, transparent 70%)" }}
      />
      {/* Accent warm blob — center-right */}
      <div
        className="absolute right-[20%] top-[40%] h-[35vh] w-[35vh] rounded-full opacity-20 blur-[90px]"
        style={{ background: "radial-gradient(circle, #f0abfc 0%, #818cf8 60%, transparent 80%)" }}
      />
    </div>
  );
}
