import { AlertCircle, CheckCircle2, Info } from "lucide-react";

type MessageProps = {
  kind?: "success" | "error" | "info";
  children: React.ReactNode;
};

export function Message({ kind = "info", children }: MessageProps): JSX.Element {
  const Icon = kind === "success" ? CheckCircle2 : kind === "error" ? AlertCircle : Info;
  return (
    <div className={`message ${kind}`} role={kind === "error" ? "alert" : "status"}>
      <Icon size={18} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
