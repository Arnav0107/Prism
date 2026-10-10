import React from "react";
import "./Button.css";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "accent" | "ghost";
  size?: "sm" | "md" | "lg";
  href?: string;
  target?: string;
  rel?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  href,
  className = "",
  ...props
}) => {
  const classNames = `prism-button prism-button--${variant} prism-button--${size} ${className}`.trim();

  if (href) {
    return (
      <a
        href={href}
        className={classNames}
        target={props.target}
        rel={props.rel || (props.target === "_blank" ? "noopener noreferrer" : undefined)}
      >
        {children}
      </a>
    );
  }

  return (
    <button className={classNames} {...props}>
      {children}
    </button>
  );
};
