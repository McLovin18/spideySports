'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../context/adminContext';
import { usePathname } from 'next/navigation';

const Sidebar = () => {
  const { user } = useAuth();
  const { isAdmin, isDelivery } = useRole();
  const pathname = usePathname();

  if (!user) return null;

  const menuItems = [
    { name: 'Inicio', path: '/', icon: 'bi-house-door' },
    { name: 'Productos', path: '/products', icon: 'bi-bag' },
    { name: 'Mis compras', path: '/myOrders', icon: 'bi-bag-check' },
    { name: 'Favoritos', path: '/favourite', icon: 'bi-heart' },
  ];

  // ✅ Agregar opciones específicas según el rol
  if (isAdmin) {
    menuItems.push(
      { name: 'Admin Pedidos', path: '/admin/orders', icon: 'bi-clipboard-data' },
      { name: 'Inventario', path: '/admin/inventory', icon: 'bi-boxes' },
      // { name: 'Migración DB', path: '/admin/migration', icon: 'bi-database-fill-gear' },
      { name: 'Estadísticas Delivery', path: '/admin/delivery-stats', icon: 'bi-graph-up-arrow' },
      { name: 'Clientes', path: '/admin/customers', icon: 'bi-people' },
      { name: 'Crear Blogs', path: '/admin/crear-blogs', icon: 'bi-journal-plus' },
      { name: 'Beneficios', path: '/admin/beneficios', icon: 'bi-gift' },

    );
  }
  
  if (isDelivery) {
    menuItems.push({ name: 'Mis Entregas', path: '/delivery/orders', icon: 'bi-truck' });
  }

  return (
    <>
      {/* Sidebar vertical para pantallas grandes - dentro del layout flex */}
      <aside className="sidebar-desktop d-none d-lg-flex flex-column flex-shrink-0 p-3 shadow-sm" style={{ width: '220px', minHeight: '100vh', borderRight: '2px solid var(--cosmetic-primary)' }}>
        <ul className="nav nav-pills flex-column mb-auto">
          {menuItems.map((item) => (
            <li key={item.path} className="nav-item mb-2">
              {(() => {
                const isActive = pathname === item.path || (item.path.startsWith('/profile') && pathname.startsWith('/profile'));
                return (
                  <Link 
                    href={item.path} 
                    className={`nav-link d-flex align-items-center gap-2 ${isActive ? 'active' : ''}`}
                    style={{ 
                      borderRadius: '0.5rem', 
                      fontWeight: 500,
                      backgroundColor: isActive ? 'var(--cosmetic-primary)' : 'transparent',
                      color: isActive ? '#ffffff' : 'var(--cosmetic-tertiary)',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = 'var(--cosmetic-secondary)';
                        e.currentTarget.style.color = 'var(--cosmetic-primary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = 'var(--cosmetic-tertiary)';
                      }
                    }}
                  >
                    <i className={`bi ${item.icon} fs-5`}></i>
                    <span>{item.name}</span>
                  </Link>
                );
              })()}
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
};

export default Sidebar;