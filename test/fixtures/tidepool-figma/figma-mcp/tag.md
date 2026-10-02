# Figma MCP: get_design_context for node 3:26 (tag)

```tsx
type TagProps = {
  className?: string;
  label?: string;
  tone?: "Neutral" | "Positive";
};

export default function Tag({ className, label = "New", tone = "Neutral" }: TagProps) {
  const isPositive = tone === "Positive";
  return (
    <div className={className || `content-stretch flex h-[20px] items-center justify-center px-[var(--padding-s,8px)] py-[var(--padding-xs,4px)] relative rounded-[var(--radii-chip,16px)] w-[80px] ${isPositive ? "bg-[#d6f5e3]" : "bg-[var(--chip-background,#e8eef9)]"}`} id={isPositive ? "node-3_24" : "node-3_22"}>
      {tone === "Neutral" && (
        <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[16px] not-italic relative shrink-0 text-[12px] text-[color:var(--chip-text,#1b2433)] whitespace-nowrap" data-node-id="3:23">
          {label}
        </p>
      )}
      {isPositive && (
        <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[16px] not-italic relative shrink-0 text-[#136c3a] text-[12px] whitespace-nowrap" data-node-id="3:25">
          {label}
        </p>
      )}
    </div>
  );
}
```

SUPER CRITICAL: The generated React+Tailwind code MUST be converted to match the target project's technology stack and styling system.
1. Analyze the target codebase to identify: technology stack, styling approach, component patterns, and design tokens
2. Convert React syntax to the target framework/library
3. Transform all Tailwind classes to the target styling system while preserving exact visual design
4. Follow the project's existing patterns and conventions
DO NOT install any Tailwind as a dependency unless the user instructs you to do so.

Node ids have been added to the code as data attributes, e.g. `data-node-id="1:2"`.

These styles are contained in the design: s: Font(family: "Inter", style: Medium, size: 12, weight: 500, lineHeight: 16, letterSpacing: 0).

Component descriptions:

## tag
**Node ID:** 3:26

A small status label. @experimental Still being designed.

Screenshot: tag.png

---

# Figma MCP: get_variable_defs for node 3:26

```json
{"var(--chip-text)": "#1b2433", "s": "Font(family: \"Inter\", style: Medium, size: 12, weight: 500, lineHeight: 16, letterSpacing: 0)", "var(--padding-s)": "8", "var(--padding-xs)": "4", "var(--radii-chip)": "16", "var(--chip-background)": "#e8eef9"}
```
