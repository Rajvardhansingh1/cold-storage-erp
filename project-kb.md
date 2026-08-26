---
project_name: Cold Storage ERP
repository: Rajvardhansingh1/cold-storage-erp
default_branch: main
last_analyzed_commit: fee7daa04e4c7525a96baaede30ddd2b464cb34e
last_updated: '2026-08-26'
---

# Cold Storage ERP — Project Knowledge Base

## 1. Executive Summary & Purpose [Repository-derived]
- **Overview**: A specialized Enterprise Resource Planning (ERP) web application designed for potato cold storage management.
- **Primary Functionality**: Streamlines the intake of agricultural stock from farmers, automates lot number indexing, categorizes potato varieties, enables voice-assisted data entry, generates printable physical receipts with custom organization watermarks, and provides managerial oversight with real-time inventory monitoring and CSV/Excel exports.
- **Evidence**: `client/src/App.jsx`, `server/server.js`.

---

## 2. Architecture & Tech Stack [Repository-derived]
- **Frontend Architecture**:
  - **Framework**: React 19 (`react` ^19.2.0, `react-dom` ^19.2.0)
  - **Build Tool**: Vite (`vite` ^7.2.4)
  - **HTTP Client**: Axios (`axios` ^1.13.4)
  - **Styling & Print**: Custom CSS (`client/src/App.css`) with CSS variables and `@media print` optimization.
  - **Browser Capabilities**: Native Web Speech API (`webkitSpeechRecognition` / `SpeechRecognition` set to `en-IN`) for voice-to-text input on form fields; `window.print()` for receipt generation.
- **Backend Architecture**:
  - **Runtime & Server**: Node.js with Express 5 (`express` ^5.2.1)
  - **Middleware**: CORS (`cors` ^2.8.6), JSON payload parsing with a 10MB limit to support base64 watermark uploads (`express.json({ limit: '10mb' })`), `dotenv` (^17.2.3).
  - **Client Port**: Defaulting to port `5000` locally.
- **Database & Identity**:
  - **Platform**: Supabase (PostgreSQL)
  - **Client Library**: `@supabase/supabase-js` (^2.93.3)
  - **Client Instances**:
    1. Standard client (`supabase`): Connects with `SUPABASE_URL` and `SUPABASE_KEY` for authenticated requests.
    2. Admin client (`supabaseAdmin`): Uses `SUPABASE_SERVICE_ROLE` with disabled session persistence to bypass Row-Level Security (RLS) for administrative workflows (user provisioning, system deletes, aggregate reads).
- **Deployment**:
  - **Backend Endpoint**: Render (`https://cold-storage-erp.onrender.com/api`) with fallback to local `http://localhost:5000/api`.
- **Evidence**: `client/package.json`, `server/package.json`, `server/server.js`, `client/src/App.jsx`.

---

## 3. User Roles & Workflows [Repository-derived]
- **Authentication Scheme**:
  - Simplified User ID login: Users supply only a `username` and `password`.
  - The backend appends a hidden domain suffix (`@coldstorage.app`) internally to authenticate against Supabase Auth (`signInWithPassword`).
- **Role 1: Employee (`role: 'employee'`)**:
  - Restricted to the **Add Inventory** tab.
  - Form Fields: Farmer Name, Father's Name, Bag Count, Base Lot identifier, categorized counts (*Mota*, *Gulla* [Plain/Colored], *KetPeice* [Plain/Colored], *Haara*), and optional Markings.
  - Voice-to-text input (🎤) available for Farmer Name, Father's Name, and Marking.
  - Automatic calculation of Total Actual bags.
  - Instant generation and printing of standardized receipt cards.
- **Role 2: Manager (`role: 'manager'`)**:
  - Full access to all 4 tabs:
    1. **Add Inventory**: Same entry workflow as employee.
    2. **View Inventory**: Global inventory table with 5-second auto-refresh polling, receipt re-printing, permanent creator attribution (`creator_name`), permanent record deletion, and client-side CSV/Excel export (`Inventory_Report_YYYY-MM-DD.csv`).
    3. **Employees**: Staff management UI to provision new employee accounts (auto-confirming email in Supabase Auth) or delete users.
    4. **Settings**: Base64 file upload for organization watermark branding with real-time UI preview.
- **Evidence**: `client/src/App.jsx` (lines 14–475).

---

## 4. Database Schema & RPC Functions [Repository-derived]
### Tables
1. **`organizations`**:
   - `id` (Primary Key, UUID)
   - `name` (Text): Company / facility display name
   - `watermark_url` (Text): Data URL or public link for receipt background watermark
2. **`profiles`**:
   - `id` (Primary Key, UUID, Foreign Key to `auth.users`)
   - `org_id` (UUID, Foreign Key to `organizations.id`)
   - `full_name` (Text)
   - `phone_number` (Text)
   - `username` (Text)
   - `role` (Text: `'manager'` | `'employee'`)
3. **`inventory_entries`**:
   - `id` (Primary Key, UUID / Serial)
   - `org_id` (UUID, Foreign Key to `organizations.id`)
   - `created_by` (UUID, Foreign Key to `profiles.id`)
   - `creator_name` (Text): Permanent creator username preserved even if profile is removed
   - `farmer_name` (Text), `father_name` (Text), `farmer_count` (Integer)
   - `lot_number_base` (Text), `lot_index` (Integer), `full_lot_number` (Text: `${lotBase}.${nextIndex}/${farmerCount}`)
   - `count_mota` (Integer), `count_gulla` (Integer), `is_gulla_colored` (Boolean)
   - `count_ketpeice` (Integer), `is_ketpeice_colored` (Boolean), `count_haara` (Integer)
   - `is_marked` (Boolean), `mark_name` (Text)
   - `actual_count` (Integer)
   - `created_at` (Timestamp with timezone)

### Stored Procedures / RPC
- **`get_next_lot_index(org_id_input, lot_base_input)`**:
  - Generates the next sequential index integer for a given organization and lot base string to construct the composite lot ID.
- **Evidence**: `server/server.js` (lines 180–225).

---

## 5. API Contracts [Repository-derived]
| Method | Route | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/login` | Public | Authenticates via pseudo-email `${username}@coldstorage.app`, returns session + profile |
| `POST` | `/api/inventory` | Employee / Manager | Calls `get_next_lot_index` RPC, persists stock record, returns full lot number |
| `POST` | `/api/manager/inventory` | Manager | Fetches all inventory records for an `orgId` ordered by `created_at DESC` |
| `POST` | `/api/manager/delete-inventory` | Manager | Deletes a specific inventory entry by `entryId` |
| `POST` | `/api/manager/employees` | Manager | Lists all profiles matching `orgId` with `role == 'employee'` |
| `POST` | `/api/manager/add-employee` | Manager | Uses `supabaseAdmin.auth.admin.createUser` to create user & profile |
| `POST` | `/api/manager/remove-employee` | Manager | Uses `supabaseAdmin.auth.admin.deleteUser` to remove staff account |
| `POST` | `/api/manager/settings` | Manager | Updates `watermark_url` in `organizations` for the given `orgId` |

- **Evidence**: `server/server.js`.

---

## 6. Environment Variables [Repository-derived]
- **`server/.env`**:
  - `PORT`: HTTP server port (Default: `5000`)
  - `SUPABASE_URL`: Supabase project URL
  - `SUPABASE_KEY`: Supabase anon/public API key
  - `SUPABASE_SERVICE_ROLE`: Supabase service role key (required for admin bypass)

---

## 7. Known Constraints & Observations [Inferred]
1. **Direct Password Handling in POST Body**: Passwords are transmitted in JSON payloads rather than OAuth/token exchanges.
2. **Hardcoded API URL in Frontend**: `App.jsx` currently toggles between Render URL and localhost directly in code. Environment variable abstraction (e.g. `import.meta.env.VITE_API_URL`) would improve CI/CD workflows.
3. **Committed `server/.env` & `node_modules`**: The initial commit contains `.env` and `server/node_modules`; `.gitignore` at the repository root would prevent node modules from tracking.
