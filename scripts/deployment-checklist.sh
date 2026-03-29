#!/bin/bash

# ============================================
# Production Deployment Checklist Script
# ============================================
# This script helps verify everything is ready
# for production deployment

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

checks_passed=0
checks_failed=0

function check_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((checks_passed++))
}

function check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((checks_failed++))
}

function check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

echo "=========================================="
echo "Production Deployment Checklist"
echo "=========================================="
echo ""

# Check required files
echo "Checking required files..."
[ -f "Dockerfile" ] && check_pass "Dockerfile exists" || check_fail "Dockerfile missing"
[ -f "Dockerfile.signaling" ] && check_pass "Dockerfile.signaling exists" || check_fail "Dockerfile.signaling missing"
[ -f "docker-compose.yml" ] && check_pass "docker-compose.yml exists" || check_fail "docker-compose.yml missing"
[ -d ".github/workflows" ] && check_pass "GitHub Actions workflows configured" || check_fail "GitHub Actions workflows missing"
echo ""

# Check environment configuration
echo "Checking environment setup..."
if [ -f ".env.production.local" ]; then
    check_pass ".env.production.local exists"
    
    if grep -q "SERVICE_AUTH_SIGNING_SECRET=CHANGEME" ".env.production.local"; then
        check_fail "SERVICE_AUTH_SIGNING_SECRET not changed from default"
    else
        check_pass "SERVICE_AUTH_SIGNING_SECRET is configured"
    fi
    
    if grep -q "DATABASE_URL=" ".env.production.local" && ! grep -q "localhost" ".env.production.local"; then
        check_pass "DATABASE_URL is configured for production"
    else
        check_fail "DATABASE_URL not properly configured"
    fi
else
    check_fail ".env.production.local not found (copy from .env.production.example)"
fi
echo ""

# Check code quality
echo "Checking code quality..."
if npm run build > /dev/null 2>&1; then
    check_pass "Application builds successfully"
else
    check_fail "Application build failed"
fi

if npx tsc --noEmit > /dev/null 2>&1; then
    check_pass "TypeScript type checking passed"
else
    check_fail "TypeScript type checking failed"
fi
echo ""

# Check dependencies
echo "Checking dependencies..."
if command -v docker &> /dev/null; then
    check_pass "Docker is installed"
    docker_version=$(docker --version)
    echo "  └─ $docker_version"
else
    check_fail "Docker is not installed"
fi

if command -v docker-compose &> /dev/null; then
    check_pass "Docker Compose is installed"
else
    check_fail "Docker Compose is not installed"
fi
echo ""

# Check Node version
echo "Checking Node.js version..."
node_version=$(node --version)
if [[ "$node_version" > "v20" ]]; then
    check_pass "Node.js version compatible: $node_version"
else
    check_warn "Node.js version is older than v20: $node_version (may work but not recommended)"
fi
echo ""

# Database configuration
echo "Checking database setup..."
if [ -f "db/schema.sql" ]; then
    check_pass "Database schema file exists"
else
    check_fail "Database schema file missing"
fi
echo ""

# Security checks
echo "Security checks..."
if grep -r "process.env.NODE_ENV === 'development'" --include="*.ts" --include="*.tsx" > /dev/null; then
    check_warn "Found development-only code - ensure it's not used in production"
fi

if grep -r "console.log" src/app/api --include="*.ts" > /dev/null 2>&1; then
    check_warn "Found console.log statements in API routes - consider using proper logging"
fi

# Check git configuration
echo ""
echo "Version control checks..."
if git rev-parse --git-dir > /dev/null 2>&1; then
    check_pass "Git repository initialized"
    
    if [ -f ".gitignore" ]; then
        check_pass ".gitignore configured"
    else
        check_fail ".gitignore missing"
    fi
else
    check_fail "Not in a git repository"
fi
echo ""

# Summary
echo "=========================================="
echo "SUMMARY"
echo "=========================================="
total=$((checks_passed + checks_failed))
echo "Checks passed: $checks_passed/$total"
echo "Checks failed: $checks_failed/$total"
echo ""

if [ $checks_failed -eq 0 ]; then
    echo -e "${GREEN}Ready for production deployment!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Review .env.production.local configuration"
    echo "  2. Run: docker-compose build"
    echo "  3. Run: docker-compose up -d"
    echo "  4. Run: docker-compose logs -f web"
    echo ""
    exit 0
else
    echo -e "${RED}Please fix the above issues before deploying${NC}"
    echo ""
    exit 1
fi
