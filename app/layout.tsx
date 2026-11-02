import type { ReactNode } from "react";
import "./style.css";
export const metadata = {
  title: "GamePulse · Flight telemetry",
  description: "Player analytics and LiveOps console.",
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
