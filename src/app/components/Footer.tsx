"use client";

import React from "react";
import { Container, Row, Col } from "react-bootstrap";
import Link from "next/link";
import { CATEGORIES, SUBCATEGORIES } from "../constants/categories"; 
import { Facebook, Instagram, Twitter, Linkedin, Github } from "lucide-react";


const Footer = () => (
  <footer 
    className="footer-cosmetic py-5 border-top mt-auto bg-inherit" 
    style={{ backgroundColor: "var(--cosmetic-secondary)" }}
  >
    <Container>
      <Row>
        {/* Sección contacto 40% del ancho */}

        <Col xs={12} md={5} className="d-flex align-items-center justify-content-center flex-column text-center">

          <img className='logo_img' style={ { maxWidth: "240px", height: "auto"}} src="/logoWeb.png" alt="Logo" />

        </Col>

        <Col>
              <div>
                <h5 className="fw-bold mb-3" style={{ color: "var(--cosmetic-accent)" }}>Enlaces útiles</h5>
                <ul>
                  
                    <li><a style={{ color: "var(--cosmetic-tertiary)" }} href="/">Inicio</a></li>
                    <li><a style={{ color: "var(--cosmetic-tertiary)" }} href="/products">Productos</a></li>
                    <li><a style={{ color: "var(--cosmetic-tertiary)" }} href="/blogs">Blogs</a></li>
                </ul>
            </div>
        </Col>
        <Col xs={12} md={5} className="d-flex align-items-center justify-content-center flex-column text-center">
          <div style={{display: "flex", flexDirection: "column"}}>
            <div style={{display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "center", padding: "1em"}}>
              <a style={{margin: "0.5em"}}
                href="https://www.facebook.com/share/17NfkFiL3i/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-500 transition-colors"
              >
                <Facebook size={24} />
              </a>

              <a
                href="https://www.instagram.com/spideysports26/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-pink-500 transition-colors"
              >
                <Instagram size={24} />
              </a>

            </div>

            <div>

              <h5 className="fw-bold mb-3" style={{ color: "var(--cosmetic-accent)" }}>Contáctanos</h5>
              <p className="mb-1" style={{ color: "var(--cosmetic-tertiary)" }}>
                Email: spideysports26@outlook.com
              </p>
              <p className="mb-0" style={{ color: "var(--cosmetic-tertiary)" }}>
                Teléfono: +593 963328168
              </p>
            </div>
          </div>


        </Col>

      </Row>


      <hr className="my-4" style={{ borderColor: "var(--cosmetic-accent)" }} />

      <div className="text-center">
        <p className="small" style={{ color: "var(--cosmetic-tertiary)" }}>
          &copy; {new Date().getFullYear()} Spidey Sports, todos los derechos reservados.
        </p>
      </div>
    </Container>

    {/* Estilos del hover de links */}
    <style jsx>{`
      .footer-link {
        position: relative;
        text-decoration: none;
      }
      .footer-link::after {
        content: "";
        position: absolute;
        width: 0;
        height: 2px;
        background-color: var(--cosmetic-accent);
        left: 0;
        bottom: -2px;
        transition: width 0.3s;
      }
      .footer-link:hover::after {
        width: 100%;
      }
    `}</style>
  </footer>
);

export default Footer;

