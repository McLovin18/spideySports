#!/bin/bash

# 🔐 SETUP SCRIPT - Configuración de Seguridad Automática
# 
# Este script automatiza la configuración inicial de seguridad
# Uso: bash setup-security.sh

set -e  # Exit on error

echo ""
echo "========================================="
echo "🔐 SPIDEY SPORTS - SETUP DE SEGURIDAD"
echo "========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# ============================================
# 1. Verificar que estamos en el directorio correcto
# ============================================
if [ ! -f "package.json" ]; then
    print_error "Este script debe ejecutarse desde la raíz del proyecto"
    exit 1
fi

print_success "Directorio de proyecto verificado"

# ============================================
# 2. Verificar que .env.local.example existe
# ============================================
if [ ! -f ".env.local.example" ]; then
    print_error ".env.local.example no encontrado"
    exit 1
fi

print_success ".env.local.example encontrado"

# ============================================
# 3. Crear .env.local si no existe
# ============================================
if [ ! -f ".env.local" ]; then
    print_info "Creando .env.local..."
    cp .env.local.example .env.local
    print_success ".env.local creado"
else
    print_warning ".env.local ya existe, saltando creación"
fi

# ============================================
# 4. Generar ENCRYPTION_KEY
# ============================================
print_info "Generando ENCRYPTION_KEY..."
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
print_success "ENCRYPTION_KEY generada"
echo -e "${YELLOW}Copia esto en .env.local:${NC}"
echo "ENCRYPTION_KEY=$ENCRYPTION_KEY"
echo ""

# ============================================
# 5. Generar ENCRYPTION_IV
# ============================================
print_info "Generando ENCRYPTION_IV..."
ENCRYPTION_IV=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
print_success "ENCRYPTION_IV generada"
echo -e "${YELLOW}Copia esto en .env.local:${NC}"
echo "ENCRYPTION_IV=$ENCRYPTION_IV"
echo ""

# ============================================
# 6. Verificar Firebase CLI
# ============================================
print_info "Verificando Firebase CLI..."
if command -v firebase &> /dev/null; then
    VERSION=$(firebase --version)
    print_success "Firebase CLI instalado: $VERSION"
else
    print_warning "Firebase CLI no encontrado"
    echo "Instala con: npm install -g firebase-tools"
fi

# ============================================
# 7. Verificar variables de entorno críticas
# ============================================
print_info "Verificando variables de entorno..."

check_env_var() {
    if grep -q "^$1=" .env.local; then
        VALUE=$(grep "^$1=" .env.local | cut -d '=' -f 2)
        if [[ "$VALUE" == "your_"* ]] || [[ "$VALUE" == "YOUR_"* ]]; then
            print_warning "$1 aún tiene valor de ejemplo"
        else
            print_success "$1 está configurada"
        fi
    else
        print_warning "$1 no está configurada"
    fi
}

check_env_var "NEXT_PUBLIC_FIREBASE_API_KEY"
check_env_var "EMAIL_USER"
check_env_var "EMAIL_PASS"

# ============================================
# 8. Crear .gitignore entry
# ============================================
print_info "Verificando .gitignore..."
if grep -q "^.env.local$" .gitignore 2>/dev/null; then
    print_success ".env.local ya está en .gitignore"
else
    print_warning ".env.local NO está en .gitignore"
    echo "Agrega manualmente a .gitignore:"
    echo ".env.local"
    echo ".env.local.backup"
    echo ".next"
    echo "build"
fi

# ============================================
# 9. Crear directorio de backups
# ============================================
print_info "Creando directorio de backups..."
mkdir -p .backups
print_success "Directorio .backups creado"

# ============================================
# 10. Hacer backup de .env.local
# ============================================
print_info "Haciendo backup de configuración..."
BACKUP_TIME=$(date +%Y%m%d_%H%M%S)
if [ -f ".env.local" ]; then
    cp .env.local .backups/.env.local.backup_$BACKUP_TIME
    print_success "Backup creado: .backups/.env.local.backup_$BACKUP_TIME"
fi

# ============================================
# 11. Limpiar directorios de build
# ============================================
print_info "Limpiando directorios de build..."
rm -rf .next
rm -rf build
print_success "Directorios limpiados"

# ============================================
# SUMMARY
# ============================================
echo ""
echo "========================================="
echo "✅ SETUP COMPLETADO"
echo "========================================="
echo ""
echo "📋 PRÓXIMOS PASOS:"
echo ""
echo "1️⃣  EDITAR .env.local y reemplazar:"
echo "   - NEXT_PUBLIC_FIREBASE_API_KEY"
echo "   - NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
echo "   - EMAIL_USER (tu email)"
echo "   - EMAIL_PASS (Google App Password)"
echo ""
echo "   📁 Ubicación: $(pwd)/.env.local"
echo ""
echo "2️⃣  Generar Google App Password:"
echo "   🔗 https://myaccount.google.com/apppasswords"
echo ""
echo "3️⃣  (Opcional) Configurar Slack:"
echo "   🔗 https://api.slack.com/apps"
echo ""
echo "4️⃣  Desplegar Firestore Rules:"
echo "   $ firebase deploy --only firestore:rules"
echo ""
echo "5️⃣  Desplegar Storage Rules:"
echo "   $ firebase deploy --only storage"
echo ""
echo "6️⃣  Iniciar desarrollo:"
echo "   $ npm run dev"
echo ""
echo "========================================="
echo "🔴 NO OLVIDES:"
echo "========================================="
echo ""
echo "❌ NUNCA commitear .env.local"
echo "❌ NUNCA usar contraseña real de Gmail"
echo "❌ NUNCA exponer ENCRYPTION_KEY"
echo "❌ NUNCA hacer .env.local NEXT_PUBLIC"
echo ""
echo "========================================="
echo ""

# ============================================
# Preguntar si desea ver más instrucciones
# ============================================
read -p "¿Deseas ver las instrucciones completas? (s/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Ss]$ ]]; then
    if [ -f "CHECKLIST_POST_IMPLEMENTACION.md" ]; then
        more CHECKLIST_POST_IMPLEMENTACION.md
    fi
fi

echo ""
print_success "¡Setup completado exitosamente!"
echo ""
