# Personal Memos / Quick Notes - User Stories

## Epic Overview
Personal Memos provide builders with a quick-capture note-taking capability for jotting down thoughts, reminders, and observations throughout the workday. Unlike formal business notes, memos are personal-scoped and private by default, serving as an individual's scratchpad within the BuildPro platform.

## Business Value
Builders and project managers frequently need to capture quick thoughts, reminders, or observations while on-site or during calls. Having a personal memo system within the project management tool eliminates the need for separate note-taking apps, keeps all work-related information in one place, and ensures important thoughts are not lost. Personal memos complement the formal business notes system by providing a lightweight, private space for individual use.

## User Personas
| Persona | Role | Goals |
|---------|------|-------|
| Builder/PM | Project Manager | Quickly capture personal thoughts and reminders without formal structure |
| Site Supervisor | Site Manager | Jot down on-site observations and to-do items for personal reference |
| Admin | Office Administrator | Maintain personal task lists and quick reference notes |

## User Stories

### US-ME001: Quick-Capture Personal Memo
**As a** Builder/PM, **I want to** quickly create a personal memo, **so that** I can capture a thought or reminder without navigating through complex forms.

**Priority:** High | **Status:** Partially Implemented

**Acceptance Criteria:**
- [ ] Create a memo with minimal required fields (title/content)
- [ ] Memo is saved with scope="personal" and type="note" in the notes system
- [ ] Default to private visibility (only visible to the creator)
- [ ] Support quick-capture from the user workspace/dashboard area
- [ ] Show success confirmation on save

---

### US-ME002: View Personal Memos List
**As a** Builder/PM, **I want to** view all my personal memos in one place, **so that** I can review and manage my quick notes.

**Priority:** High | **Status:** Partially Implemented

**Acceptance Criteria:**
- [ ] Display personal memos filtered by scope="personal" from the notes system
- [ ] Show memo title, content preview, and creation date
- [ ] Sort by most recently updated
- [ ] Only show memos belonging to the current user
- [ ] Accessible from the user workspace area

---

### US-ME003: Edit Personal Memo
**As a** Builder/PM, **I want to** edit an existing personal memo, **so that** I can update or expand on my notes.

**Priority:** High | **Status:** Partially Implemented

**Acceptance Criteria:**
- [ ] Open memo for editing with existing content loaded
- [ ] Support rich text editing via the notes editor
- [ ] Save changes to the existing note record
- [ ] Show last modified timestamp

---

### US-ME004: Delete Personal Memo
**As a** Builder/PM, **I want to** delete a personal memo, **so that** I can remove notes I no longer need.

**Priority:** Medium | **Status:** Partially Implemented

**Acceptance Criteria:**
- [ ] Delete memo via the notes deletion mechanism
- [ ] Show confirmation before deletion
- [ ] Remove memo from the personal memos list
- [ ] Show success toast notification

---

### US-ME005: Search Personal Memos
**As a** Builder/PM, **I want to** search through my personal memos, **so that** I can find a specific note quickly.

**Priority:** Medium | **Status:** Partially Implemented

**Acceptance Criteria:**
- [ ] Text search across memo titles and content
- [ ] Real-time filtering as user types
- [ ] Search scoped to personal memos only
- [ ] Show result count

---

### US-ME006: Personal Memo Privacy
**As a** Builder/PM, **I want to** ensure my personal memos are private by default, **so that** only I can see my personal notes.

**Priority:** High | **Status:** Partially Implemented

**Acceptance Criteria:**
- [ ] Memos created with scope="personal" are only visible to the creating user
- [ ] Personal memos do not appear in business/team notes views
- [ ] No sharing or collaboration features on personal memos
- [ ] API enforces ownership check on read/update/delete operations

---

### US-ME007: Pin Important Memos
**As a** Builder/PM, **I want to** pin important memos to the top of my list, **so that** I can keep critical reminders visible.

**Priority:** Low | **Status:** Partially Implemented

**Acceptance Criteria:**
- [ ] Toggle pin status on individual memos via the notes pinning mechanism
- [ ] Pinned memos appear at the top of the memos list
- [ ] Visual indicator for pinned memos
- [ ] Unpin memos when no longer needed at the top

---

## Technical Notes
- **IMPORTANT:** Personal memos do NOT have a dedicated schema, API routes, or backend module. They are implemented as personal-scoped records within the existing notes system.
- Memos use the `notes` table with `scope="personal"` and `type="note"` to differentiate from business notes.
- The Notes.tsx page (1732 lines) handles both business notes and personal memos, filtering by scope.
- The Memos.tsx component in the user workspace provides a focused view of personal-scoped notes.
- All memo CRUD operations go through the standard `/api/notes` endpoints with scope filtering.
- No dedicated memo API routes exist; the notes API serves both business and personal use cases.
- Privacy is enforced through the combination of scope="personal" and owner-based filtering.
- This architecture means memos inherit all notes system capabilities (rich text, categories, etc.) but may not expose all of them in the personal memo UI.

## API Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/notes?scope=personal | List personal memos (filtered from notes) |
| POST | /api/notes | Create a new memo (with scope="personal") |
| GET | /api/notes/:id | Get a single memo/note |
| PATCH | /api/notes/:id | Update a memo/note |
| DELETE | /api/notes/:id | Delete a memo/note |

## Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| /workspace | UserWorkspace.tsx > Memos.tsx | Personal memos tab within user workspace |
| /notes | Notes.tsx | Full notes page (includes personal memos when filtered) |

## Known Issues / Future Enhancements
- [ ] Memos lack a dedicated backend schema and API, relying on the notes system
- [ ] No dedicated quick-capture widget on the main dashboard
- [ ] No voice-to-text memo creation for hands-free on-site use
- [ ] No automatic categorisation or tagging of memos
- [ ] No memo reminders or scheduled follow-ups
- [ ] No export of memos to other formats
- [ ] Consider implementing a lightweight dedicated memo system for better separation of concerns

## Change Log
| Date | Change | Author |
|------|--------|--------|
| 2025-02-20 | Initial creation | BuildPro Team |

## Implementation Coverage Summary
- Total Stories: 7
- Implemented: 0
- Partially Implemented: 7
- Not Implemented: 0
