import React, { useEffect, useRef, useState } from "react";
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
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // If IntersectionObserver is not supported or user prefers reduced motion, show immediately
    if (
      typeof window === "undefined" ||
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (sectionRef.current) {
            observer.unobserve(sectionRef.current);
          }
        }
      },
      {
        threshold: 0.1,
        rootMargin: "0px 0px -40px 0px",
      }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id={id}
      aria-labelledby={`${id}-heading`}
      className={`prism-section ${isVisible ? "prism-section--visible" : ""} ${className}`.trim()}
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
