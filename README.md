# 💸 Expense Splitter

A clean, human-friendly web application designed to make splitting bills, tracking group expenses, and settling up debts completely stress-free. 

Built with **React 18** and **Vite**, it focuses on fast performance, pixel-perfect responsive design, and high-precision financial math.

---

## 🌟 Key Features & Why People Benefit

### 1. 🛑 Goodbye, Weird Rounding Bugs
Most splitting apps suffer from floating-point rounding errors (e.g., `0.1 + 0.2` unexpectedly equals `0.30000000000000004`). If you split ₹1000 among 3 people, the totals break. 
*   **The Benefit:** This app processes all currency transactions strictly in **integer paise** behind the scenes. Any remainder penny is distributed cleanly using a deterministic tie-break system. Your splits balance perfectly down to the single paisa.

### 2. ⚡ Immediate Guest Mode (No Account Needed)
You are at a restaurant with friends and want to calculate a split instantly without making everyone sign up.
*   **The Benefit:** Use **Quick Split** right out of the box. It runs entirely in your browser's local state. You get a clean payment blueprint immediately without storing a single byte of private data on a server.

### 3. 🛡️ Safe, Fraud-Proof Settlement Flows
In generic group sheets, anyone can accidentally erase a record or claim they paid without verification.
*   **The Benefit:** The app uses a controlled, one-way validation process:
    *   Only the person who owes money can click **"I have paid"**.
    *   Only the person receiving the money can click **"Confirm received"**.
    This ensures nobody can falsely clear their own debts.

### 4. 🔒 Zero Financial Intrusion & Complete Privacy
Many modern utilities demand access to your bank accounts or card statements.
*   **The Benefit:** This app **never links to your bank** and does not move real money. It acts strictly as a secure informational ledger. When settling up, it generates an informational UPI QR code visible *only* to the two members involved in that specific transfer.

---

## 🏗️ System Architecture: A Two-Part Ecosystem

The application is split into two completely separate systems that work in harmony:

```text
  ┌──────────────────────────┐               ┌──────────────────────────┐               ┌──────────────────────────┐
  │      FRONTEND (Client)   │               │     BACKEND (Server)     │               │    DATABASE (Storage)    │
  │     React 18 + Vite      │  ───JSON───>  │   Django REST Framework  │  ────ORM────> │        PostgreSQL        │
  │  (Runs in User Browser)  │  <──Session─  │ (Runs on Secured Server) │               │   (Persistent Storage)   │
  └──────────────────────────┘               └──────────────────────────┘               └──────────────────────────┘
```

*   **🎨 The Frontend (React 18 + Vite):** Handles everything the user sees. It controls smooth, instant page navigation, layout viewports (Mobile, Tablet, Desktop), form collection, and the offline Quick Split calculator math engine.
*   **🛡️ The Backend (Django REST Framework + PostgreSQL):** Handles the brain and security logic. It guards user accounts, session logins, email verification, database locking (to prevent double-click errors), and data persistence.

---

## 🚀 How to Run the Project Locally

Follow these quick steps to get the front-end application running on your computer:

### 1. Clone the repository and navigate inside
```bash
git clone https://github.com
cd expense-splitter-frontend
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up your environment file
```bash
cp .env.example .env
```

### 4. Start the local development server
```bash
npm run dev
```
Now open **`http://localhost:5173`** in your browser to interact with the application!
