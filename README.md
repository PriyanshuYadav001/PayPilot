# PayPilot - Autonomous B2B Accounts Receivable & Payment Recovery SaaS

PayPilot is an autonomous multi-tenant B2B Accounts Receivable (AR) automation and payment recovery platform. It streamlines invoice management, orchestrates multi-channel customer follow-ups (Email, WhatsApp, Voice Calls), detects payment promises via AI, and reconciles payments in real time.

---

## 🏛️ Project Architecture & Structure

```
PayPilot/
├── client/                     # Vite + React 19 + TypeScript + Tailwind CSS Frontend
│   ├── src/
│   │   ├── components/         # Layout, Header, Sidebar, StatCard UI components
│   │   ├── contexts/           # AuthContext, OrganizationContext
│   │   ├── hooks/              # useAuth, useOrganization custom hooks
│   │   ├── lib/                # apiClient, supabaseClient
│   │   ├── pages/              # Dashboard, Invoices, Customers, FollowUps, Settings
│   │   ├── types/              # Frontend interfaces & metric view models
│   │   ├── App.tsx             # Root application component
│   │   ├── index.css           # Tailwind base styles
│   │   └── main.tsx            # DOM entry point
│   ├── index.html              # HTML shell
│   ├── tsconfig.json           # Client TypeScript configuration
│   └── vite.config.ts          # Vite build & proxy configuration
├── server/                     # Node.js + Express + TypeScript Backend
│   ├── lib/                    # Supabase server client
│   ├── middleware/             # Auth, Tenant context, Request validation, Error handler
│   ├── routes/                 # Health check & API v1 router
│   ├── services/               # Provider interface abstractions (Payment, Email, WhatsApp, Call, AI)
│   ├── utils/                  # Logger, standard response helpers
│   ├── app.ts                  # Express application setup
│   ├── index.ts                # Server listener entry point
│   └── tsconfig.json           # Server TypeScript configuration
├── shared/                     # Shared TypeScript types, Enums, and Zod schemas
│   ├── constants/              # Subscription limits, default follow-up cadence rules
│   ├── types/                  # Database models, DTOs, Enums
│   ├── validators/             # Zod validation schemas across client & server
│   └── index.ts                # Shared module export
├── supabase/                   # Supabase database configuration & migrations
│   ├── migrations/             # Versioned PostgreSQL DDL with RLS & Triggers
│   └── config.toml             # Local Supabase CLI configuration
├── tests/                      # Testing Framework (Vitest + Testing Library)
│   ├── unit/                   # Unit tests (Validators, Constants, API Client, Health, App)
│   └── setup.ts                # Vitest setup & DOM matchers
├── docs/                       # Architecture & System Specifications
│   ├── architecture.md         # System Architecture & Provider Abstractions
│   ├── database-schema.md      # PostgreSQL DDL, tables, constraints, indexes & RLS policies
│   ├── api-spec.md             # REST API specifications, payloads & error codes
│   ├── security-model.md       # Multi-tenancy isolation & auth model
│   └── implementation-roadmap.md # Step-by-step phased execution plan
├── .env.example                # Unified environment configuration template
├── .gitignore                  # Git ignore rules
├── eslint.config.mjs           # ESLint configuration
├── package.json                # Project dependencies and development scripts
├── tsconfig.json               # Root TypeScript configuration
└── vitest.config.ts            # Vitest test runner configuration
```

---

## 🛠️ Technology Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons
- **Backend**: Express 5, Node.js, TypeScript, TSX
- **Validation**: Zod (shared across frontend and backend)
- **Database & Auth**: Supabase Managed PostgreSQL with Row-Level Security (RLS) & GoTrue Auth
- **Testing**: Vitest, @testing-library/react, @testing-library/jest-dom, Supertest
- **Code Quality**: ESLint v9, Prettier

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js >= 20
- npm >= 10

### 2. Setup Environment
```bash
cp .env.example .env
```

### 3. Install Dependencies
```bash
npm install
```

---

## 📜 Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Runs both backend server and Vite frontend concurrently in development mode |
| `npm run client` | Starts the Vite client development server (`http://localhost:5173`) |
| `npm run server` | Starts the Express backend server with hot reloading (`http://localhost:5000`) |
| `npm run build` | Builds both the Vite client production bundle and TypeScript server files |
| `npm run test` | Runs the Vitest test suite |
| `npm run test:coverage` | Runs tests with code coverage report |
| `npm run lint` | Runs ESLint across all TypeScript and React files |
| `npm run lint:fix` | Automatically fixes ESLint issues |
| `npm run format` | Formats code with Prettier |

---

## 📚 Architecture Documentation

- [Architecture Design](docs/architecture.md)
- [Database Schema & RLS Policies](docs/database-schema.md)
- [REST API Specification](docs/api-spec.md)
- [Security & Isolation Model](docs/security-model.md)
- [Implementation Roadmap](docs/implementation-roadmap.md)
