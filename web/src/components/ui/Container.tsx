import React from "react";
import "./Container.css";

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  as?: React.ElementType;
}

export const Container: React.FC<ContainerProps> = ({
  children,
  className = "",
  as: Component = "div",
  ...props
}) => {
  return (
    <Component className={`prism-container ${className}`.trim()} {...props}>
      {children}
    </Component>
  );
};
