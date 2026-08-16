"use client";

import { useEffect, useState, type ReactNode } from "react";

export interface HeroSliderProps {
  slides: string[];
  children: ReactNode;
}

export default function HeroSlider({ slides, children }: HeroSliderProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const hasSlides = slides.length > 0;

  useEffect(() => {
    if (!hasSlides || paused || slides.length < 2) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, 3000);
    return () => clearInterval(id);
  }, [hasSlides, paused, slides.length]);

  useEffect(() => {
    if (index >= slides.length && slides.length > 0) setIndex(0);
  }, [slides.length, index]);

  const dots =
    hasSlides && slides.length > 1 ? (
      <div className="hero-slider-dots" role="tablist" aria-label="Hero slides">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            className={`hero-slider-dot${i === index ? " active" : ""}`}
            aria-label={`Go to slide ${i + 1}`}
            aria-selected={i === index}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    ) : null;

  return (
    <section
      className="hero-slider"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <style>{`
        .hero-slider {
          position: relative;
          width: 100%;
          background: #111111;
        }
        .hero-slider-stage {
          position: relative;
          width: 100%;
          height: 600px;
          overflow: hidden;
          background: linear-gradient(135deg, #1a0533 0%, #2d1b69 50%, #1a0533 100%);
        }
        .hero-slider-slide {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0;
          transition: opacity 0.8s ease-in-out;
          pointer-events: none;
        }
        .hero-slider-slide.active {
          opacity: 1;
          pointer-events: auto;
        }
        .hero-slider-overlay {
          position: absolute;
          inset: 0;
          z-index: 1;
          background: linear-gradient(
            to right,
            rgba(0,0,0,0.85) 0%,
            rgba(0,0,0,0.75) 40%,
            rgba(0,0,0,0.3) 70%,
            rgba(0,0,0,0.1) 100%
          );
          pointer-events: none;
        }
        .hero-slider-content {
          position: absolute;
          z-index: 2;
          left: 0;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          padding: 40px 60px;
          max-width: 1300px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
        }
        .hero-slider .hero-slider-content h1,
        .hero-slider .hero-slider-content h1 span,
        .hero-slider .hero-slider-content h1 * {
          color: #FFFFFF !important;
          -webkit-text-fill-color: #FFFFFF !important;
        }
        .hero-slider .hero-slider-content h1 span {
          color: #c4b5fd !important;
          -webkit-text-fill-color: #c4b5fd !important;
          text-shadow: 0 2px 8px rgba(0,0,0,0.8);
        }
        .hero-slider .hero-slider-content p,
        .hero-slider .hero-slider-content p * {
          color: rgba(255,255,255,0.95) !important;
          -webkit-text-fill-color: rgba(255,255,255,0.95) !important;
        }
        /* Desktop: dots overlay bottom of stage */
        .hero-slider-dots {
          position: absolute;
          z-index: 10;
          left: 50%;
          bottom: 20px;
          transform: translateX(-50%);
          display: flex;
          gap: 10px;
          align-items: center;
          justify-content: center;
        }
        .hero-slider-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.85);
          background: transparent;
          padding: 0;
          cursor: pointer;
          transition: background 0.2s, transform 0.2s;
        }
        .hero-slider-dot.active {
          background: #FFFFFF;
        }
        .hero-slider-dot:hover {
          transform: scale(1.15);
        }
        @media (max-width: 1024px) {
          .hero-slider-stage { height: 480px; }
          .hero-slider-content { padding: 32px 40px; }
        }
        @media (max-width: 640px) {
          .hero-slider-stage {
            height: auto;
            min-height: 0;
            padding: 28px 0 24px;
            overflow: hidden;
            display: flex;
            align-items: center;
          }
          .hero-slider-content {
            position: relative;
            top: auto;
            left: auto;
            right: auto;
            transform: none;
            padding: 0 20px;
            width: 100%;
          }
          /* Mobile: dots OUTSIDE stage (sibling), relative */
          .hero-slider-dots {
            position: relative;
            left: auto;
            bottom: auto;
            transform: none;
            display: flex;
            justify-content: center;
            padding: 12px 0;
            background: #0a0010;
            gap: 12px;
          }
          .hero-slider-dot {
            width: 14px;
            height: 14px;
          }
        }
      `}</style>

      <div className="hero-slider-stage">
        {hasSlides &&
          slides.map((src, i) => (
            <img
              key={`${src}-${i}`}
              src={src}
              alt=""
              className={`hero-slider-slide${i === index ? " active" : ""}`}
              draggable={false}
            />
          ))}

        <div className="hero-slider-overlay" aria-hidden />

        <div className="hero-slider-content">{children}</div>
      </div>

      {dots}
    </section>
  );
}
