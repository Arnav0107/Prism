import React from "react";
import "./Rule.css";

export interface RuleProps extends React.HTMLAttributes<HTMLHRElement> {
  variant?: "subtle" | "strong" | "accent";
  spacing?: "none" | "sm" | "md" | "lg";
}

export const Rule: React.FC<RuleProps> = ({
  variant = "subtle",
  spacing = "none",
  className = "",
  ...props
}) => {
  return (
    <hr
      className={`prism-rule prism-rule--${variant} prism-rule--space-${spacing} ${className}`.trim()}
      {...props}
    />
  );
};
