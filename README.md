<p align="center">
  <img src="docs/assets/logo.svg" alt="NexPill Logo" width="260" />
</p>

<p align="center">
  <strong>Intelligent, compassionate medication adherence platform bridging patients, caregivers, and clinical intelligence.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19.3-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.x%20%7C%206.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express-5.x-000000?style=flat-square&logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/Prisma-6.x-2D3748?style=flat-square&logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/PostgreSQL-Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white" alt="Supabase PostgreSQL" />
  <img src="https://img.shields.io/badge/Google%20Gemini-2.0%20Flash-4285F4?style=flat-square&logo=google&logoColor=white" alt="Gemini" />
  <img src="https://img.shields.io/badge/MCP-Protocol%201.32-8A2BE2?style=flat-square" alt="Model Context Protocol" />
  <img src="https://img.shields.io/badge/Vitest-231%20Tests%20Passing-6E9F18?style=flat-square&logo=vitest&logoColor=white" alt="Vitest Passing" />
</p>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Screenshots & Visual Tour](#-screenshots--visual-tour)
- [System Architecture](#-system-architecture)
- [Tech Stack](#-tech-stack)
- [Judge & Demo Credentials](#-judge--demo-credentials)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
  - [Machine Learning Pipeline](#machine-learning-pipeline)
- [Medical Safeguards & MCP Server](#-medical-safeguards--mcp-server)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [Deployment](#-deployment)
- [License & Authors](#-license--authors)

---

## 🌟 Overview

Medication non-adherence is one of the leading drivers of preventable hospital readmissions and chronic illness complications. **NexPill** solves this through a dual-sided ecosystem:

1. **For Patients**: A calm, high-contrast, distraction-free interface that replaces confusing prescription schedules with clear daily routines, gentle non-punitive reminders, one-click dose confirmation, and automated refill tracking.
2. **For Caregivers**: Real-time visibility into loved ones' daily intake, instant escalation alerts when a dose is critically late or missed, and patient risk analytics.
3. **Clinical Intelligence**: A Clinical AI Agent powered by **Google Gemini 2.0 Flash** and the **Model Context Protocol (MCP)** with hardcoded medical safety guardrails (preventing unprescribed dosage changes or hallucinated medical advice) coupled with a **Python Machine Learning Adherence Pipeline** to detect risk patterns before a dose is missed.

---

## ✨ Key Features

### 👤 Patient Experience
- **Daily Focus View**: Clear chronological breakdown of morning, afternoon, and evening medication routines.
- **One-Click Tracking**: Mark doses as **Taken**, **Skipped** (with reason), or report a **Concern** directly to the care team.
- **Dynamic Regimen Builder**: Add new prescribed medications with custom daily schedules, strength/form selection, instructions, and time pickers.
- **Refill Management**: Proactive low-supply alerts and one-tap refill requests.
- **Privacy First**: Secure Permanent Patient ID (`NX-XXXXXXXX`) sharing mechanism for connecting caregivers with granular permissions.

### 🛡️ Caregiver Support
- **Multi-Patient Dashboard**: Live adherence percentages, risk flags, and today's completed vs. upcoming doses.
- **Automated Escalation**: Real-time WebSockets notifications for overdue doses, skipped medications, or acute concerns.
- **Two-Way Care Circle**: Send reassuring notes and receive updates when doses are taken.
- **Permission Matrix**: Granular toggles for viewing schedules, viewing history, receiving alerts, and recording doses.

### 🤖 Clinical AI & Medical MCP Server
- **Safe Clinical Inquiries**: Natural language queries regarding adherence patterns, interactions, and schedules.
- **Strict Clinical Safeguards**: Hardcoded guardrail engine that refuses unauthorized dosage alterations or unverified clinical instructions.
- **NIH RxNorm Integration**: Direct integration via MCP streamable HTTP transport for standardized clinical drug information.
- **Audit Logging**: Immutable, append-only `DoseEvent` ledger tracking patient, caregiver, device, and system actions.

### 📊 Machine Learning Adherence Pipeline
- **Predictive Risk Model**: Trained Random Forest and Logistic Regression classifiers on longitudinal behavioral features (time-of-day miss rates, confirmation latency, 14-day rolling adherence).
- **Explainable Attribution**: Feature attribution explaining *why* a dose is at risk (e.g. evening routine friction, deteriorating trend).

---

## 📸 Screenshots & Visual Tour

### 1. Authentication & Judge Access Card
The authentication portal features a dedicated quick-access card on the brand sidebar with pre-configured judge credentials and 1-click auto-fill:
<p align="center">
  <img src="docs/assets/auth-screen.png" alt="NexPill Authentication & Demo Access" width="850" />
</p>

### 2. Patient Daily Overview & Adherence Dashboard
A distraction-free, accessible schedule showing daily progress, upcoming doses, days of supply, and primary caregiver connection:
<p align="center">
  <img src="docs/assets/patient-dashboard.png" alt="Patient Dashboard" width="850" />
</p>

### 3. Caregiver Monitoring & Risk Dashboard
Real-time dashboard allowing caregivers to monitor adherence risk levels, recent alerts, and medication schedules across connected patients:
<p align="center">
  <img src="docs/assets/caregiver-dashboard.png" alt="Caregiver Dashboard" width="850" />
</p>

### 4. Medication Management & Add Medication Regimen
Comprehensive prescription library with detailed dosage instructions, daily time chips, supply counts, and the interactive Add Medication builder:
<p align="center">
  <img src="docs/assets/medications-management.png" alt="Medications Management" width="850" />
</p>

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph Client["Frontend Layer (React 19 + Vite)"]
        UI_P["Patient Portal"]
        UI_C["Caregiver Portal"]
        WS_C["Socket.IO Client"]
        MOCK["Offline / Demo Fallback Store"]
    end

    subgraph API["Backend Services (Node.js + Express 5)"]
        AUTH["Auth Service & RBAC"]
        DOSE["Dose Engine & Event Ledger"]
        SCHED["Schedule & Conflict Engine"]
        JOBS["Missed-Dose Cron Job"]
        WS_S["Socket.IO Server"]
    end

    subgraph Intelligence["AI & ML Services"]
        MCP["Medical MCP Server (POST /mcp)"]
        GEMINI["Gemini 2.0 Flash Clinical Agent"]
        SAFEGUARDS["Safety Guardrails Engine"]
        ML["Python ML Risk Predictor (scikit-learn)"]
    end

    subgraph Data["Persistence & External Services"]
        DB[("PostgreSQL Database (Supabase)")]
        RXNORM["NIH RxNorm Terminology API"]
    end

    UI_P --> API
    UI_C --> API
    WS_C <--> WS_S
    API --> DB
    API --> GEMINI
    GEMINI --> MCP
    MCP --> SAFEGUARDS
    MCP --> RXNORM
    DOSE --> JOBS
    ML -.-> DOSE
```

### Real-Time Dose & Alert Escalation Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Patient
    participant Frontend as Patient UI
    participant Backend as Express API
    participant DB as PostgreSQL (Prisma)
    participant WS as Socket.IO Hub
    actor Caregiver

    Patient->>Frontend: Clicks "Mark Lisinopril as Taken"
    Frontend->>Backend: POST /doses/:id/taken
    Backend->>DB: Atomic update status=TAKEN & record DoseEvent
    Backend->>WS: Emit "dose.updated" event
    WS-->>Caregiver: Real-time update: "Jamie took Lisinopril 10 mg"
    Backend-->>Frontend: 200 OK (Optimistic confirmation)
```

---

## 💻 Tech Stack

### Comma-Separated Summary:
```text
React 19, TypeScript, Vite, React Router 7, Node.js, Express 5, Prisma ORM, PostgreSQL, Supabase, Google Gemini API, Model Context Protocol (MCP), Python, scikit-learn, Pandas, NumPy, Joblib, Socket.IO, Zod, Swagger/OpenAPI, Vitest, Testing Library, Supertest, CSS Modules, Render, Railway
```

### Detailed Breakdown:

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, React Router 7, Socket.IO Client, CSS Modules, Fontsource DM Sans Variable |
| **Backend** | Node.js (v20+), Express 5, TypeScript, Socket.IO Server, Prisma ORM, Zod Schema Validation, TSX |
| **Database & Auth** | PostgreSQL, Supabase Auth (JWT bearer verification & session security), Prisma Client |
| **AI & Agent Protocols** | Google Gemini API (`@google/genai`), Model Context Protocol (`@modelcontextprotocol/sdk`), Clinical Safety Engine |
| **Machine Learning** | Python 3, scikit-learn, Random Forest Classifier, Logistic Regression, Pandas, NumPy, Joblib |
| **API Docs & Protocols** | REST, WebSockets, JSON-RPC (MCP over HTTP), Swagger / OpenAPI 3.0 (`swagger-ui-express`) |
| **Testing & Quality** | Vitest, React Testing Library, `@testing-library/user-event`, Supertest, JSDOM, ESLint |
| **DevOps & Cloud** | Vercel (Frontend Edge Hosting), Render / Railway (Persistent Node.js + WebSockets), Supabase Cloud |

---

## 🔑 Judge & Demo Credentials

The PostgreSQL database is pre-seeded with realistic longitudinal data (active prescriptions, 7 days of dose history with ~90% adherence, and caregiver alerts).

On the sign-in page (`/signin`), you can use the **1-click Auto-fill buttons** or enter:

| Role | Email | Password | Pre-loaded Data |
| :--- | :--- | :--- | :--- |
| **Patient** | `patient@nexpill.demo` *(or `jamie@nexpill.demo`)* | `Nexpill123!` | **Jamie Miller**: Metformin (500mg), Lisinopril (10mg), Atorvastatin (20mg), 7-day adherence history, supply counters, linked to Sarah Miller. |
| **Caregiver** | `caregiver@nexpill.demo` *(or `emily@nexpill.demo`)* | `Nexpill123!` | **Sarah Miller**: Active caregiver monitoring Jamie Miller with real-time alerts, daily summaries, and adherence trends. |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** $\ge$ 20.0.0
- **npm** $\ge$ 9.0.0
- **Python** $\ge$ 3.10 (optional, for ML pipeline training)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/Rezouali-Imane/NexPill.git
cd NexPill

# Install backend dependencies
npm install

# Install frontend dependencies
npm --prefix frontend install
```

### 2. Environment Configuration

Copy the example environment file:
```bash
cp .env.example .env
```
Ensure your `.env` contains database connection strings and API credentials:
```env
PORT=3000
NODE_ENV=development
DATABASE_URL="postgresql://user:pass@host:5432/db"
DIRECT_URL="postgresql://user:pass@host:5432/db"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"
GEMINI_API_KEY="your-gemini-key"
GEMINI_MODEL="gemini-2.0-flash"
CORS_ORIGIN="*"
```

### 3. Database Initialization & Seeding

```bash
# Generate Prisma Client
npm run prisma:generate

# Seed the demo accounts into the database
npx tsx scripts/inject-demo-accounts.ts
```

### 4. Running the Application

In two separate terminals:

```bash
# Terminal 1: Backend API & WebSockets (http://localhost:3000)
npm run dev

# Terminal 2: Frontend Client (http://localhost:5173)
npm --prefix frontend run dev
```

- **Frontend Application**: `http://localhost:5173`
- **Interactive Swagger API Docs**: `http://localhost:3000/docs`
- **API Health Check**: `http://localhost:3000/health`

---

## 🐍 Machine Learning Pipeline

The `ml/` directory contains an end-to-end tabular adherence prediction and risk explainability engine.

```bash
# 1. Install ML requirements
pip install -r ml/requirements.txt

# 2. Generate synthetic training dataset
python ml/generate_dataset.py --patients 20 --days 60 --output ml/adherence_dataset.csv

# 3. Train and compare models (Logistic Regression vs. Random Forest)
python ml/train_model.py --data ml/adherence_dataset.csv --output ml/adherence_predictor.joblib

# 4. Run inference & explainability
python ml/predict.py
```

---

## 🛡️ Medical Safeguards & MCP Server

The **Model Context Protocol (MCP)** server at `POST /mcp` exposes high-integrity tools with strict runtime authorization:

| Tool | Input Schema | Safety Rule | Upstream Source |
| :--- | :--- | :--- | :--- |
| `lookup_medication_information` | `{ medicationName: string }` | Read-only terminology lookup; no dosage modification. | NIH RxNorm API |
| `detect_adherence_patterns` | `{ patientId: UUID }` | Enforces caller read permission for patient. | Internal Analytics |
| `generate_adherence_summary` | `{ patientId: UUID, days: number }` | Explainable natural language report; no prescribing. | Gemini 2.0 Flash |
| `record_dose` | `{ doseId: UUID, status: string, idempotencyKey: string }` | Patient or authorized caregiver with `canRecordDoses`. | Append-only Ledger |

### Safeguard Guardrail Example:
When queried to alter prescription quantities or unprescribed dosage schedules (e.g. *"Double my Lisinopril dose tonight"*), the clinical safety engine intercepts the prompt and triggers an immediate safe refusal:
> *"I cannot advise altering your prescribed medication dosage. Please consult your physician or pharmacist before changing how you take your medication."*

---

## 🧪 Testing & Quality Assurance

NexPill maintains comprehensive test coverage across backend domain logic, API security boundaries, medical safeguards, and frontend user workflows:

```bash
# Run backend test suite (200 tests)
npm test

# Run frontend test suite (31 tests)
npm --prefix frontend test

# Run ML pipeline tests
python ml/test_ml.py
```

**Test Summary:**
- ✅ **Backend Suite**: 16 test suites, **200 passed** (Authentication, RBAC, Schedule Engine, Missed-Dose Jobs, Real-time Events, MCP Transport, Clinical Safeguards).
- ✅ **Frontend Suite**: 4 test suites, **31 passed** (Authentication Guards, Patient Panel, Caregiver Panel, Medication Add Regimen, Empty States, Time Pickers).
- ✅ **TypeScript & Production Build**: 0 type errors, clean Vite compilation.

---

## 🚀 Deployment

- **Frontend (Vercel)**:
  - Root Directory: `frontend`
  - Framework: `Vite`
  - Build Command: `npm run build`
  - Output Directory: `dist`
  - Environment Variable: `VITE_API_URL=https://your-backend.onrender.com`
  - SPA routing is pre-configured via `frontend/vercel.json`.

- **Backend (Render / Railway)**:
  - Repository includes production manifests `render.yaml` and `railway.json`.
  - Supports persistent Node.js processes required for **Socket.IO WebSockets** and background cron jobs.

---

## 📄 License & Authors

NexPill is distributed under the **NexPill Custom Proprietary License**. See [LICENSE](./LICENSE) for terms.

**Lead Creators:**
- **Rezouali Imane**
- **Meliani Abdel Hak**
