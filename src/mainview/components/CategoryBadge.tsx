import type { EmailCategory } from "../hooks/useInbox";

export function CategoryBadge({ category, className = "" }: { category: EmailCategory, className?: string }) {
  if (category === "regular" || !category) return null;

  // Mid-tone colors that work reasonably well on both light and dark modes
  const styleMap: Record<EmailCategory, string> = {
    important: "bg-[#c4a35a]/15 text-[#c4a35a]",
    promotional: "bg-[#a35ac4]/15 text-[#a35ac4]",
    social: "bg-[#5a7dc4]/15 text-[#5a7dc4]",
    updates: "bg-[#5a8c6f]/15 text-[#5a8c6f]",
    forums: "bg-[#c47d5a]/15 text-[#c47d5a]",
    spam: "bg-[#c45a5a]/15 text-[#c45a5a]",
    personal: "bg-[#5aa8c4]/15 text-[#5aa8c4]",
    regular: "",
  };

  const labelMap: Record<EmailCategory, string> = {
    important: "Important",
    promotional: "Promo",
    social: "Social",
    updates: "Updates",
    forums: "Forums",
    spam: "Spam",
    personal: "Personal",
    regular: "",
  };

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase font-[family-name:var(--font-family-sans)] ${styleMap[category]} ${className}`}>
      {labelMap[category]}
    </span>
  );
}