import React from "react";
import "./Badge.css";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: "neutral" | "accent";
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "neutral",
  className = "",
  ...props
}) => {
  return (
    <span
      className={`prism-badge prism-badge--${variant} ${className}`.trim()}
      {...props}
    >
      <span className="prism-badge__bracket">[</span>
      <span className="prism-badge__content">{children}</span>
      <span className="prism-badge__bracket">]</span>
    </span>
  );
};
