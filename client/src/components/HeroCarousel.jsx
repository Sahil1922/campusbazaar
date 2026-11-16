import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon.jsx';

/**
 * Rotating promotional banners. Advances every 6 s, pauses while hovered or focused,
 * and does not auto-advance for visitors who prefer reduced motion.
 * slides: [{ id, title, text, icon, tone: 'blue' | 'red' | 'amber', cta: { label, onClick } }]
 */
export default function HeroCarousel({ slides, label = 'Highlights' }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  const go = useCallback((i) => setIndex(((i % count) + count) % count), [count]);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (paused || reduced || count < 2) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => clearInterval(timer);
  }, [paused, count]);

  return (
    <section
      className="carousel"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="carousel-track" style={{ transform: `translateX(-${index * 100}%)` }}>
        {slides.map((slide, i) => (
          <div
            key={slide.id}
            className={`slide slide-${slide.tone}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
            aria-hidden={i !== index}
          >
            <div className="slide-copy">
              {slide.badge && <span className="live-badge">{slide.badge}</span>}
              <h2>{slide.title}</h2>
              <p>{slide.text}</p>
              <button type="button" className="button button-large slide-cta" tabIndex={i === index ? 0 : -1} onClick={slide.cta.onClick}>
                {slide.cta.label}
              </button>
            </div>
            <span className="slide-art" aria-hidden="true">
              <Icon name={slide.icon} size={150} />
            </span>
          </div>
        ))}
      </div>
      {count > 1 && (
        <>
          <button type="button" className="carousel-arrow carousel-prev" aria-label="Previous banner" onClick={() => go(index - 1)}>
            <Icon name="chevronDown" size={26} style={{ transform: 'rotate(90deg)' }} />
          </button>
          <button type="button" className="carousel-arrow carousel-next" aria-label="Next banner" onClick={() => go(index + 1)}>
            <Icon name="chevronDown" size={26} style={{ transform: 'rotate(-90deg)' }} />
          </button>
          <div className="carousel-dots">
            {slides.map((slide, i) => (
              <button key={slide.id} type="button" aria-label={`Show banner ${i + 1}`} aria-current={i === index} onClick={() => go(i)} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
