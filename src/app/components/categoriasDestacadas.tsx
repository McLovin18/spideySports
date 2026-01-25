"use client";

import { useRef, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Category {
  id: number;
  title: string;
  subtitle: string;
  link: string;
  background: string;
  accent: string;
  icon: string;
  image: string;
  imageAlt: string;
}

const hexToRgba = (hex: string, alpha = 1): string => {
  let normalized = hex.replace("#", "");
  if (normalized.length === 3) {
    normalized = normalized
      .split("")
      .map((char) => char + char)
      .join("");
  }

  const intValue = parseInt(normalized, 16);
  if (Number.isNaN(intValue)) {
    return `rgba(3, 123, 144, ${alpha})`;
  }

  const r = (intValue >> 16) & 255;
  const g = (intValue >> 8) & 255;
  const b = intValue & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const categories: Category[] = [
  {
    id: 1,
    title: "Clubes de Europa",
    subtitle: "Premier, LaLiga y Serie A",
    link: "/categories/premier-league",
    background: "linear-gradient(135deg, rgba(3,24,27,0.92) 0%, rgba(3,123,144,0.32) 100%)",
    accent: "#037b90",
    icon: "bi-shield-fill",
    image: "/teams.jpeg",
    imageAlt: "Camisas de clubes europeos"
  },
  {
    id: 2,
    title: "Selecciones de América",
    subtitle: "CONMEBOL & Concacaf",
    link: "/categories/americas",
    background: "linear-gradient(135deg, rgba(3,24,27,0.92) 0%, rgba(242,166,90,0.28) 100%)",
    accent: "#f2a65a",
    icon: "bi-flag-fill",
    image: "/coleccionSelecciones.png",
    imageAlt: "Camisetas de selecciones americanas"
  },
  {
    id: 3,
    title: "Player Issue",
    subtitle: "Ediciones profesionales",
    link: "/categories/matchday",
    background: "linear-gradient(135deg, rgba(3,24,27,0.92) 0%, rgba(5,183,213,0.35) 100%)",
    accent: "#05b7d5",
    icon: "bi-lightning-charge-fill",
    image: "/hero-player-issue.svg",
    imageAlt: "Camiseta player issue de edición profesional"
  },
  {
    id: 4,
    title: "Retro & Leyendas",
    subtitle: "Décadas 80s • 90s • 00s",
    link: "/categories/retro-90s",
    background: "linear-gradient(135deg, rgba(3,24,27,0.95) 0%, rgba(144,0,0,0.32) 100%)",
    accent: "#900000",
    icon: "bi-rewind-fill",
    image: "/hero-retro-legends.svg",
    imageAlt: "Camiseta retro legendaria"
  }
];

const FeaturedCategories = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Controla visibilidad de flechas dinámicamente
  const checkScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const { scrollLeft, scrollWidth, clientWidth } = container;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  };

  useEffect(() => {
    checkScroll();
    const container = containerRef.current;
    if (container) container.addEventListener("scroll", checkScroll);
    return () => container?.removeEventListener("scroll", checkScroll);
  }, []);

  const scroll = (direction: "left" | "right") => {
    const container = containerRef.current;
    if (!container) return;
    const cardWidth = container.firstElementChild?.clientWidth || 0;
    const scrollAmount = cardWidth + 16; // un poco de espacio entre tarjetas
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  return (
    <section className="my-10 relative jersey-featured-categories">
      <h2
        className="text-center mb-6 fw-bold"
        style={{ fontSize: "2rem", color: "var(--spidey-heading)" }}
      >
        Colecciones Futboleras Destacadas
      </h2>

      <div className="relative max-w-6xl mx-auto px-4">
        {/* Flecha Izquierda */}
        <button
          onClick={() => scroll("left")}
          disabled={!canScrollLeft}
          className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/80 hover:bg-white text-gray-700 rounded-full p-2 shadow-md transition ${
            !canScrollLeft ? "opacity-40 cursor-not-allowed" : ""
          }`}
        >
          <ChevronLeft size={28} />
        </button>

        {/* Carrusel scrollable */}
        <div
          ref={containerRef}
          className="flex overflow-x-auto scroll-smooth no-scrollbar gap-4"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {categories.map((cat) => {
            const accentGlow = hexToRgba(cat.accent, 0.58);
            const mediaStyle: CSSProperties = {
              boxShadow: `0 28px 90px -54px ${accentGlow}`,
            };
            const overlayStyle: CSSProperties = {
              background: `linear-gradient(180deg, rgba(3, 24, 27, 0) 48%, rgba(3, 24, 27, 0.92) 100%), radial-gradient(circle at 82% 18%, rgba(255, 255, 255, 0.18), transparent 60%), radial-gradient(circle at 12% 88%, ${hexToRgba(cat.accent, 0.45)}, transparent 70%)`,
            };
            const iconAura = hexToRgba(cat.accent, 0.16);
            const iconGlow = hexToRgba(cat.accent, 0.28);
            const ctaShadow = `0 16px 48px -26px ${hexToRgba(cat.accent, 0.7)}`;

            return (
              <div
                key={cat.id}
                className="flex-none scroll-snap-align-start w-full sm:w-[48%] lg:w-[32%] relative"
                style={{ height: "360px" }}
              >
                <div
                  className="jersey-category-card"
                  style={{ background: cat.background }}
                >
                  <div className="jersey-category-media" style={mediaStyle}>
                    <Image
                      src={cat.image}
                      alt={cat.imageAlt}
                      fill
                      sizes="(max-width: 768px) 88vw, (max-width: 1024px) 44vw, 28vw"
                      priority={cat.id <= 2}
                    />
                    <div className="jersey-category-media-overlay" style={overlayStyle} />
                  </div>

                  <div className="jersey-category-content">
                    <span
                      className="jersey-category-icon"
                      style={{
                        color: cat.accent,
                        background: iconAura,
                        boxShadow: `inset 0 0 18px ${iconGlow}`,
                      }}
                    >
                      <i className={`bi ${cat.icon}`} aria-hidden="true"></i>
                    </span>
                    <h3 className="fw-bold text-white mt-3 mb-2">{cat.title}</h3>
                    <p className="text-white-50 mb-0">{cat.subtitle}</p>
                  </div>

                  <Link
                    href={cat.link}
                    className="btn btn-primary rounded-1 px-4 jersey-category-cta"
                    style={{
                      backgroundColor: cat.accent,
                      borderColor: cat.accent,
                      boxShadow: ctaShadow,
                    }}
                  >
                    Ver colección
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Flecha Derecha */}
        <button
          onClick={() => scroll("right")}
          disabled={!canScrollRight}
          className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/80 hover:bg-white text-gray-700 rounded-full p-2 shadow-md transition ${
            !canScrollRight ? "opacity-40 cursor-not-allowed" : ""
          }`}
        >
          <ChevronRight size={28} />
        </button>
      </div>
    </section>
  );
};

export default FeaturedCategories;
