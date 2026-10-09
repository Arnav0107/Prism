import React from "react";
import { Container } from "./Container";
import { Rule } from "./Rule";
import { Label } from "./Label";
import "./Section.css";

export interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  id: string;
  number: string;
  category: string;
  heading?: React.ReactNode;
  lead?: React.ReactNode;
  children: React.ReactNode;
  hideTopRule?: boolean;
}

export const Section: React.FC<SectionProps> = ({
  id,
  number,
  category,
  heading,
  lead,
  children,
  hideTopRule = false,
  className = "",
  ...props
}) => {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className={`prism-section ${className}`.trim()}
      {...props}
    >
      <Container>
        {!hideTopRule && <Rule spacing="none" />}

        <div className="prism-section__header">
          <div className="prism-section__meta">
            <Label variant="accent" className="prism-section__num">
              {number}
            </Label>
            <span className="prism-section__slash">/</span>
            <Label variant="muted">{category}</Label>
          </div>

          {heading && (
            <h2 id={`${id}-heading`} className="prism-section__heading">
              {heading}
            </h2>
          )}

          {lead && <p className="prism-section__lead">{lead}</p>}
        </div>

        <div className="prism-section__content">{children}</div>
      </Container>
    </section>
  );
};
