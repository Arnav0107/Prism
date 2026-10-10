import React from "react";
import "./Label.css";

export interface LabelProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: "muted" | "default" | "accent";
  as?: React.ElementType;
}

export const Label: React.FC<LabelProps> = ({
  children,
  variant = "muted",
  className = "",
  as: Component = "span",
  ...props
}) => {
  return (
    <Component
      className={`prism-label prism-label--${variant} ${className}`.trim()}
      {...props}
    >
      {children}
    </Component>
  );
};
