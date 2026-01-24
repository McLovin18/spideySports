'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { Navbar, Nav, Container, NavDropdown } from 'react-bootstrap';
import { cartService } from '../services/cartService';
import { SUBCATEGORIES, CATEGORIES } from '../constants/categories';
import UserNotificationBell from './UserNotificationBell';

const CATEGORY_VISUALS: Record<string, { icon: string; tagline: string }> = {
  clubKits: {
    icon: 'bi-shield-fill',
    tagline: 'Club kits élite',
  },
  nationalTeams: {
    icon: 'bi-flag-fill',
    tagline: 'Orgullo nacional',
  },
  specialEditions: {
    icon: 'bi-stars',
    tagline: 'Drops exclusivos',
  },
  retroClassics: {
    icon: 'bi-rewind-fill',
    tagline: 'Clásicos eternos',
  },
};

const NavbarComponent = () => {
  const { user, logout } = useAuth();
  const router = useRouter();

  const [expanded, setExpanded] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [isClient, setIsClient] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement | null>(null);
  const [dropdownAlignment, setDropdownAlignment] = useState<Record<string, 'start' | 'end'>>({});

  // 🔥 Hook para actualizar altura SOLO del navbar (sin el contenido expandido)
  useEffect(() => {
    if (!activeDropdown) return; // Solo ejecutar si hay un menú abierto

    const handlePosition = () => {
      if (window.innerWidth < 992) return;

      const dropdownButton = document.getElementById(`nav-dropdown-${activeDropdown}`);
      if (!dropdownButton) return;

      const rect = dropdownButton.getBoundingClientRect();
      const screenWidth = window.innerWidth;
      const threshold = 600;

      let newAlignment: 'start' | 'end' = 'start';

      if (rect.right > screenWidth - threshold) {
        newAlignment = 'end';
      }

      setDropdownAlignment(prev => {
        if (prev[activeDropdown] !== newAlignment) {
          return {
            ...prev,
            [activeDropdown]: newAlignment,
          };
        }
        return prev;
      });
    };

    const timeoutId = setTimeout(handlePosition, 0);
    window.addEventListener('resize', handlePosition);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handlePosition);
    };
  }, [activeDropdown]);



  // detectar click fuera del nav para cerrar (solo en desktop)
  useEffect(() => {
    const handleClickOutside = (ev: MouseEvent) => {
      const isMobile = window.innerWidth < 992;

      if (isMobile) {
        return; 
      }

      if (navRef.current && !navRef.current.contains(ev.target as Node)) {
        setActiveDropdown(null);
        setExpanded(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => setIsClient(true), []);

  useEffect(() => {
    if (!isClient) return;
    if (!user?.uid) {
      const updateGuestCount = () => {
        const guestItems = cartService.getGuestCart();
        const count = guestItems.reduce((acc, it) => acc + it.quantity, 0);
        setCartCount(count);
      };
      updateGuestCount();
      window.addEventListener('cart-updated', updateGuestCount);
      return () => window.removeEventListener('cart-updated', updateGuestCount);
    }

    cartService.migrateFromLocalStorage(user.uid);
    const unsub = cartService.subscribe((items) => {
      const count = items.reduce((acc, it) => acc + it.quantity, 0);
      setCartCount(count);
    }, user.uid);

    return unsub;
  }, [isClient, user?.uid]);

  const handleLogout = async () => {
    try { await logout(); } catch (err) { console.error(err); }
  };

  // Maneja click en título de categoría (abre/cierra acordeón)
  const toggleCategory = (catId: string) => {
    setActiveDropdown(prev => (prev === catId ? null : catId));
  };

  // Maneja click en subcategoria en móvil
  const handleSubcategoryClick = (catId: string, subValue: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Cerrar menú y navegar
    setExpanded(false);
    setActiveDropdown(null);
    
    // Navegar a la categoría
    router.push(`/categories/${subValue}`);
  };

  return (
    <>
      <Navbar 
        id="main-navbar" 
        expand="lg" 
        expanded={expanded} 
        className="py-2 shadow-sm bg-cosmetic-secondary position-sticky top-0" 
        ref={navRef}
        style={{ zIndex: 1030 }}
      >
        <Container className="navbar-container">
          {/* fila 1 - logo arriba, menú alineado y acciones móviles debajo */}
          <div className="first-row d-flex flex-column flex-lg-row w-100 px-3 py-1 ">
            {/* Subfila superior: logo + botón de menú (móvil) */}
            <div className="d-flex justify-content-between align-items-center w-100">
              <Navbar.Brand as={Link} href="/" className="me-auto spidey-logo-brand" aria-label="Inicio SpideySports">
                <span className="spidey-logo-wrapper">
                  <img className="spidey-logo" src="/logoWeb.png" alt="Logo SpideySports" />
                </span>
              </Navbar.Brand>

              <Navbar.Toggle
                className="btn btn-primary d-lg-none ms-3"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setExpanded(prev => !prev);
                }}
              />
            </div>

            {/* Subfila inferior en móvil: campana y carrito; en desktop se alinea a la derecha */}
            <div className="d-flex align-items-center justify-content-end mt-2 mt-lg-0 w-100 ms-lg-3">
              <Nav className="d-none d-lg-flex me-4">
                <Nav.Link as={Link} href="/blogs" className="fw-medium">Blog</Nav.Link>
              </Nav>

              {/* Campanita de notificaciones para el cliente */}
              <div className="d-flex align-items-center me-1">
                <UserNotificationBell />
              </div>

              <Nav.Link as={Link} href="/cart" className="me-4 position-relative" aria-label="Carrito">
                <i className="bi bi-cart" style={{ fontSize: "1.5rem", color: "var(--cosmetic-accent)" }}></i>
                {cartCount > 0 && (
                  <span className="badge bg-danger rounded-circle position-absolute top-0 start-100 translate-middle p-1">
                    {cartCount}
                  </span>
                )}
              </Nav.Link>

              <div className="d-none d-lg-flex">
                {user ? (
                  <Nav.Link as={Link} href="/profile" className="me-2">Mi cuenta</Nav.Link>
                ) : (
                  <>
                    <Nav.Link as={Link} href="/auth/login" className="me-2">Iniciar sesión</Nav.Link>
                    <Nav.Link as={Link} href="/auth/register">Registrate</Nav.Link>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Fila 2 - CATEGORÍAS (Desktop) */}
          <div className="second-row main-menu-row d-none d-lg-flex flex-wrap justify-content-center w-100 px-3 pb-2">
            <Nav className="flex-wrap justify-content-center main-menu-nav">
              {CATEGORIES.map(cat => {
                const isOpen = activeDropdown === cat.id;
                const visuals = CATEGORY_VISUALS[cat.id];

                // ✅ Lógica: Si la categoría está en nuestra lista de "problemas de borde derecho",
                // la forzamos a alinearse al 'end' (que hace que se expanda a la izquierda).
                // De lo contrario, usamos el valor por defecto ('start' o null).
                const alignment = dropdownAlignment[cat.id] || 'start';
                return (
                  <NavDropdown
                    key={cat.id}
                    title={(
                      <span className="main-menu-link">
                        <span className="menu-icon-wrapper">
                          <i className={`bi ${visuals?.icon ?? 'bi-hexagon-fill'} menu-icon`} aria-hidden="true" />
                        </span>
                        <span className="menu-text">
                          <span className="menu-label">{cat.label}</span>
                          {visuals?.tagline && (
                            <small className="menu-tagline">{visuals.tagline}</small>
                          )}
                        </span>
                      </span>
                    )}
                    id={`nav-dropdown-${cat.id}`}
                    show={isOpen}
                    onMouseEnter={() => setActiveDropdown(cat.id)}
                    onMouseLeave={() => setActiveDropdown(prev => (prev === cat.id ? null : prev))}
                    className="mx-2 my-1 main-menu-item"
                    // ✅ APLICAMOS el alineamiento forzado
                    align={alignment}
                  >
                    <div id={`dropdown-${cat.id}`} className="dropdown-grid">
                      {SUBCATEGORIES.filter(s => s.id === cat.id).map(sub => (
                        <NavDropdown.Item
                          key={sub.value}
                          as={Link}
                          href={`/categories/${sub.value}`}
                          className="nav-subcategory"
                          onClick={() => {
                            setActiveDropdown(null);
                            setExpanded(false);
                          }}
                        >
                          {sub.label}
                        </NavDropdown.Item>
                      ))}
                    </div>
                  </NavDropdown>
                );
              })}
            </Nav>
          </div>

          {/* 🔥 MENÚ MÓVIL (sin cambios) */}
          <Navbar.Collapse id="basic-navbar-nav" className="d-lg-none">
            <div className="d-flex flex-column" style={{ maxHeight: '70vh' }}>
              {/* 🔥 Área de categorías con scroll */}
              <div 
                className="mobile-menu-content flex-grow-1"
                style={{
                  maxHeight: '25vh', 
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  paddingBottom: '0.5rem'
                }}
              >
                <Nav className="flex-column text-start px-3 py-3">
                  {CATEGORIES.map(cat => {
                    const isOpen = activeDropdown === cat.id;
                    const visuals = CATEGORY_VISUALS[cat.id];
                    return (
                      <div key={cat.id} className="mb-3 w-100">
                        {/* título categoría */}
                        <button
                          type="button"
                          onClick={() => toggleCategory(cat.id)}
                          className="w-100 bg-transparent border-0 d-flex justify-content-between align-items-center nav-category py-2"
                          aria-expanded={isOpen}
                          aria-controls={`mobile-cat-${cat.id}`}
                          style={{ 
                            fontWeight: isOpen ? 650 : 500
                          }}
                        >
                          <span className="d-flex flex-column flex-sm-row align-items-start align-items-sm-center gap-1 menu-button-text">
                            <span className="d-flex align-items-center gap-2">
                              <i className={`bi ${visuals?.icon ?? 'bi-hexagon-fill'} menu-icon`} aria-hidden="true" />
                              <span className="text-start">{cat.label}</span>
                            </span>
                            {visuals?.tagline && (
                              <small className="menu-tagline text-start ms-sm-1">{visuals.tagline}</small>
                            )}
                          </span>
                          <span aria-hidden style={{ 
                            transition: 'transform 0.2s',
                            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                            fontSize: '0.9rem'
                          }}>
                            ▼
                          </span>
                        </button>

                        {/* lista subcategorías con animación */}
                        <div 
                          id={`mobile-cat-${cat.id}`} 
                          className={`ps-3 ${isOpen ? 'd-block' : 'd-none'}`}
                          style={{
                            animation: isOpen ? 'slideDown 0.2s ease-out' : 'none'
                          }}
                        >
                          {SUBCATEGORIES.filter(s => s.id === cat.id).map(sub => (
                            <a
                              key={sub.value}
                              href={`/categories/${sub.value}`}
                              onClick={(e) => handleSubcategoryClick(cat.id, sub.value, e)}
                              className="nav-subcategory d-block py-2 px-2"
                              role="link"
                            >
                              {sub.label}
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </Nav>
              </div>

              {/* 🔥 Botones fijos siempre visibles */}
              <div 
                className="mobile-menu-actions border-top px-3 py-3 bg-cosmetic-secondary"
                style={{ 
                  borderColor: 'rgba(3, 123, 144, 0.25) !important',
                  flexShrink: 0
                }}
              >
                <a 
                  className="btn btn-primary w-100 mb-2 d-block text-center py-2" 
                  href="/blogs" 
                  onClick={(e) => { 
                    e.preventDefault(); 
                    setExpanded(false); 
                    router.push('/blogs'); 
                  }}
                >
                  Blog
                </a>

                {user ? (
                  <a 
                    className="btn btn-primary w-100 d-block text-center py-2" 
                    href="/profile" 
                    onClick={(e) => { 
                      e.preventDefault(); 
                      setExpanded(false); 
                      router.push('/profile'); 
                    }}
                  >
                    Mi cuenta
                  </a>
                ) : (
                  <>
                    <a 
                      className="btn btn-primary w-100 mb-2 d-block text-center py-2" 
                      href="/auth/login" 
                      onClick={(e) => { 
                        e.preventDefault(); 
                        setExpanded(false); 
                        router.push('/auth/login'); 
                      }}
                    >
                      Iniciar sesión
                    </a>
                    <a 
                      className="btn btn-secondary w-100 d-block text-center py-2" 
                      href="/auth/register" 
                      onClick={(e) => { 
                        e.preventDefault(); 
                        setExpanded(false); 
                        router.push('/auth/register'); 
                      }}
                    >
                      Registrate
                    </a>
                  </>
                )}
              </div>
            </div>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      {/* 🔥 Estilos CSS (sin cambios) */}
      <style jsx global>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .mobile-menu-content::-webkit-scrollbar {
          width: 8px;
        }

        .mobile-menu-content::-webkit-scrollbar-track {
          background: var(--cosmetic-secondary);
          border-radius: 4px;
        }

        .mobile-menu-content::-webkit-scrollbar-thumb {
          background: var(--cosmetic-primary);
          border-radius: 4px;
        }

        .mobile-menu-content::-webkit-scrollbar-thumb:hover {
          background: var(--cosmetic-accent);
        }

        .nav-subcategory:hover {
          background-color: rgba(140, 156, 132, 0.1);
          color: var(--cosmetic-primary) !important;
          padding-left: 1rem !important;
        }

        /* 🔥 Sombra superior en botones para indicar que hay scroll arriba */
        .mobile-menu-actions {
          box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
        }

        #main-navbar {
          transition: none !important;
        }

        .navbar-collapse {
          transition: none !important;
        }

        /* Asegurar que el navbar-collapse no afecte el cálculo de altura */
        #basic-navbar-nav.collapsing,
        #basic-navbar-nav.collapse.show {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: var(--cosmetic-secondary);
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          z-index: 1000;
        }
        
        /* Aseguramos que el menú de Bootstrap no tenga un ancho fijo que cause problemas */
        .dropdown-menu {
          min-width: 250px; 
          max-width: max-content; 
          width: auto;
        }
      `}</style>
    </>
  );
};

export default NavbarComponent;