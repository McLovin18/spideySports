import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./globals.css";
import "./styles/cosmetic-theme.css";
import ClientLayout from "./ClientLayout";
import NavbarComponent from './components/Navbar';
import PayPalProvider from "./components/paypalProvider";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://spideysports.vercel.app/'),
  title: {
    default: 'SpideySports | Pasión por la camiseta',
    template: '%s | SpideySports'
  },
  description: 'Encuentra jerseys exclusivos, ediciones limitadas y colecciones especiales de SpideySports para vivir cada partido al máximo.',
  keywords: [
    'spideysports',
    'jerseys de futbol',
    'camisetas exclusivas',
    'merchandising deportivo',
    'colecciones limitadas',
    'ropa deportiva premium',
    'equipaciones oficiales',
    'servicio delivery futbol',
    'clubes europeos',
    'selecciones nacionales'
  ],
  authors: [{ name: 'SpideySports Studio' }],
  creator: 'SpideySports',
  publisher: 'SpideySports',
  applicationName: 'SpideySports',
  category: 'E-commerce',
  classification: 'Sports apparel and collectibles',
  manifest: '/manifest.json',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "es_ES",
    url: 'https://spideysports.vercel.app',
    siteName: 'SpideySports',
    title: 'SpideySports | Jerseys y colecciones exclusivas',
    description: 'Vive la pasión por el fútbol con ediciones de colección, lanzamientos player issue y drops retro en SpideySports.',
    images: [
      {
        url: '/logoWeb.png',
        width: 1200,
        height: 630,
        alt: 'SpideySports - Jerseys y colecciones exclusivas',
        type: 'image/png',
      }
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: '@spideysports',
    creator: '@spideysports',
    title: 'SpideySports | Jerseys y colecciones exclusivas',
    description: 'Drops especiales, player issue, selecciones y collabs únicas disponibles en SpideySports.',
    images: ['/logoWeb.png'],
  },
  verification: {
    google: 'google-site-verification-code',
  },
  alternates: {
    canonical: 'https://spideysports.vercel.app/',
    languages: {
      'es-ES': 'https://spideysports.vercel.app/',
    },
  },
  other: {
    'theme-color': '#111827',
    'color-scheme': 'light',
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': 'SpideySports',
    'format-detection': 'telephone=no',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#000000',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/logoShop1.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/logoShop1.png" />
        <link rel="shortcut icon" href="/logoShop1.png" type="image/png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/logoShop1.png" />
        <meta name="theme-color" content="#000000" />
        <meta name="msapplication-TileColor" content="#000000" />
        <meta name="msapplication-TileImage" content="/logoShop1.png" />
        <meta name="description" content= "Descubre los mejores suministros de oficina en Tiffany's, cosmeticos, productos orgánicos y mucho más" />

      </head>
      <body  className={`${geistSans.variable} ${geistMono.variable}`}>
          <ClientLayout>
            <NavbarComponent />
            <PayPalProvider>
              {children}
            </PayPalProvider>
          </ClientLayout>

      </body>
    </html>
  );
}
