# Figma MCP: get_design_context for node 3:8 (button)

```tsx
type ButtonProps = {
  className?: string;
  disabled?: boolean;
  label?: string;
  state?: "Default" | "Hover";
};

export default function Button({ className, disabled = false, label = "Save", state = "Default" }: ButtonProps) {
  const isDefaultAndDisabled = state === "Default" && disabled;
  const isHoverAndNotDisabled = state === "Hover" && !disabled;
  return (
    <div className={className || `content-stretch flex gap-[var(--gap-s,4px)] h-[32px] items-center justify-center px-[var(--padding-m,12px)] py-[var(--padding-xs,4px)] relative rounded-[var(--radii-button,8px)] w-[80px] ${isDefaultAndDisabled ? "bg-[var(--button-background,#1f5fd6)] opacity-50" : isHoverAndNotDisabled ? "bg-[var(--button-background-hover,#1849a8)]" : "bg-[var(--button-background,#1f5fd6)]"}`} id={isDefaultAndDisabled ? "node-3_6" : isHoverAndNotDisabled ? "node-3_4" : "node-3_2"}>
      <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[20px] not-italic relative shrink-0 text-[14px] text-[color:var(--button-text,white)] whitespace-nowrap" data-node-id="3:3">
        {label}
      </p>
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

These styles are contained in the design: m: Font(family: "Inter", style: Medium, size: 14, weight: 500, lineHeight: 20, letterSpacing: 0).

Component descriptions:

## button
**Node ID:** 3:8

The main action on a screen.

Some elements have annotation data attributes. They provide extra information about how the element should be implemented. IMPORTANT: Do not ignore these annotation attributes. They should not appear in your final code.

Screenshot: button.png
