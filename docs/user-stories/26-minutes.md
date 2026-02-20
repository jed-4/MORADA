# Meeting Minutes - User Stories

## Epic Overview
Meeting Minutes enables builders to document site meetings, client discussions, and team briefings with rich text content, attendee tracking, and action item management. The feature includes AI-powered capabilities for audio transcription and automatic summary generation, streamlining the documentation of on-site conversations and formal project meetings.

## Business Value
For Australian residential builders, meeting minutes are essential for maintaining a clear record of decisions, commitments, and responsibilities discussed during site meetings, client handovers, and subcontractor briefings. Having structured minutes with action item tracking ensures accountability, reduces disputes, and provides a defensible paper trail. AI transcription and summarisation capabilities save significant admin time, allowing builders to focus on construction rather than paperwork.

## User Personas
| Persona | Role | Goals |
|---------|------|-------|
| Builder/PM | Project Manager | Document meetings efficiently and track action items to completion |
| Site Supervisor | Site Manager | Record site meeting discussions and assign follow-up tasks |
| Admin | Office Administrator | Organise and search meeting records, ensure documentation completeness |
| Subcontractor | Trade Contractor | Review meeting notes and assigned action items |

## User Stories

### US-MN001: View All Meeting Minutes
**As a** Builder/PM, **I want to** view a list of all meeting minutes, **so that** I can quickly find and review past meeting records.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Display minutes in a list/table with title, meeting date, location, and project
- [ ] Support text search across minute titles and content
- [ ] Show total count of meeting minutes
- [ ] Sort minutes by meeting date (most recent first)

---

### US-MN002: Create New Meeting Minutes
**As a** Builder/PM, **I want to** create new meeting minutes, **so that** I can document discussions and decisions from a meeting.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Provide fields for title, meeting date, and location
- [ ] Allow optional project association via project selector
- [ ] Default meeting date to current date/time
- [ ] Navigate to minute detail view on successful creation
- [ ] Record owner (current user) automatically

---

### US-MN003: Edit Meeting Minutes with Rich Text
**As a** Builder/PM, **I want to** write and edit meeting content using a rich text editor, **so that** I can format notes with headings, lists, and emphasis for clarity.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Provide Tiptap rich text editor for meeting content
- [ ] Support formatting: bold, italic, underline, headings, bullet lists, numbered lists
- [ ] Store content as both HTML (contentHtml) and plain text (contentText)
- [ ] Auto-save content changes on update
- [ ] Preserve formatting when loading existing minutes

---

### US-MN004: Manage Meeting Attendees
**As a** Builder/PM, **I want to** add and manage meeting attendees, **so that** I have a record of who was present at each meeting.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Add attendees by typing names manually
- [ ] Add attendees by selecting from existing contacts
- [ ] Store attendees as JSON array supporting both simple names and {name, contactId} objects
- [ ] Display attendee list on minute detail view
- [ ] Remove individual attendees from the list

---

### US-MN005: Add Attendees from Contacts
**As a** Builder/PM, **I want to** select meeting attendees from my contacts list, **so that** I can quickly add known participants without retyping their details.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Provide searchable contact selector for attendee addition
- [ ] Link selected contacts via contactId for reference
- [ ] Display contact name in attendee list
- [ ] Support hybrid approach: mix of manual names and linked contacts

---

### US-MN006: Create Action Items
**As a** Site Supervisor, **I want to** add action items to meeting minutes, **so that** follow-up tasks are clearly documented and assigned.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Add action items with description, assignee, and due date fields
- [ ] Store action items as JSON array on the minute record
- [ ] Display action items in a checklist format
- [ ] Each action item has a completed boolean flag
- [ ] Support multiple action items per minute

---

### US-MN007: Track Action Item Completion
**As a** Builder/PM, **I want to** mark action items as complete, **so that** I can track progress on meeting follow-ups.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Toggle completion status on each action item via checkbox
- [ ] Persist completed state immediately on toggle
- [ ] Visually differentiate completed vs outstanding items (strikethrough or dimmed)
- [ ] Show completion count (e.g. "3 of 5 completed")

---

### US-MN008: Upload Meeting Recording
**As a** Builder/PM, **I want to** upload an audio recording of a meeting, **so that** I can preserve the full discussion and enable AI transcription.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Support audio file upload (MP3, WAV, M4A formats)
- [ ] Upload via multer middleware on POST /api/minutes/:id/transcribe
- [ ] Store recording file reference (recordingUrl, recordingFileName, recordingFileUrl)
- [ ] Show upload progress indicator
- [ ] Display uploaded recording with playback option

---

### US-MN009: AI Transcription of Meeting Recording
**As a** Builder/PM, **I want to** automatically transcribe an uploaded meeting recording, **so that** I can have a written record without manual note-taking.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Trigger transcription via POST /api/minutes/:id/transcribe endpoint
- [ ] Track transcription status (pending/processing/completed/failed)
- [ ] Display transcription progress status to user
- [ ] Store completed transcription text on the minute record
- [ ] Handle transcription failures gracefully with error messaging

---

### US-MN010: AI Summary Generation
**As a** Builder/PM, **I want to** generate an AI summary of meeting content, **so that** I can quickly review key points without reading the full minutes.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Generate summary via POST /api/minutes/:id/summarize endpoint
- [ ] AI processes contentText and/or transcription to produce summary
- [ ] Store generated summary in aiSummary field
- [ ] Display summary prominently on minute detail page
- [ ] Allow regeneration of summary if content changes

---

### US-MN011: Link Minutes to Projects
**As a** Builder/PM, **I want to** associate meeting minutes with a specific project, **so that** I can find all meeting records for a given build.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Project selector dropdown when creating/editing minutes
- [ ] Filter minutes list by project when accessed within project context
- [ ] Display project name on minutes list view
- [ ] Support minutes without a project (general meetings)

---

### US-MN012: View Minute Detail
**As a** Builder/PM, **I want to** view the full detail of a meeting minute, **so that** I can review content, attendees, action items, and recordings.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Display meeting title, date, location, and project
- [ ] Show rich text content in rendered format
- [ ] List all attendees
- [ ] Show action items with completion status
- [ ] Display AI summary if available
- [ ] Show recording player if recording uploaded
- [ ] Show transcription if available

---

### US-MN013: Edit Meeting Minutes Details
**As a** Builder/PM, **I want to** update meeting minute details after creation, **so that** I can correct or add information as needed.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Edit title, meeting date, location via PATCH /api/minutes/:id
- [ ] Update attendees list
- [ ] Update content via rich text editor
- [ ] Update action items
- [ ] Show loading state during save

---

### US-MN014: Delete Meeting Minutes
**As a** Builder/PM, **I want to** delete meeting minutes, **so that** I can remove erroneous or duplicate records.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Delete minute via DELETE /api/minutes/:id
- [ ] Show confirmation dialog before deletion
- [ ] Navigate back to minutes list after deletion
- [ ] Show success toast notification

---

### US-MN015: Search and Filter Minutes
**As a** Admin, **I want to** search and filter meeting minutes, **so that** I can quickly locate specific meeting records.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Text search across minute titles and content
- [ ] Filter by project association
- [ ] Filter by date range
- [ ] Real-time filtering as user types
- [ ] Show result count

---

### US-MN016: View Transcription Status
**As a** Builder/PM, **I want to** see the current status of a meeting transcription, **so that** I know when it will be ready to review.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Display transcription status badge (pending/processing/completed/failed)
- [ ] Show progress indicator while processing
- [ ] Auto-refresh status until transcription completes
- [ ] Display error message if transcription fails

---

## Technical Notes
- Meeting content stored in dual format: contentHtml (Tiptap rich text) for rendering and contentText (plain text) for search/AI processing
- Attendees stored as JSON array supporting mixed format: simple strings or {name, contactId} objects
- Action items stored as JSON array of objects with {description, assignee, dueDate, completed} structure
- Transcription uses AI service triggered via multer file upload on /api/minutes/:id/transcribe
- AI summary generation via /api/minutes/:id/summarize processes contentText and/or transcription
- transcriptionStatus enum: pending, processing, completed, failed
- Recording files stored via object storage with recordingUrl, recordingFileName, recordingFileUrl fields
- Owner tracked via ownerId (user reference) and ownerName (denormalised)
- Frontend split across Minutes.tsx (494 lines, list view) and MinuteDetail.tsx (451 lines, detail/edit view)

## API Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/minutes | List all minutes (with optional projectId query param) |
| POST | /api/minutes | Create new meeting minutes |
| GET | /api/minutes/:id | Get a single minute record |
| PATCH | /api/minutes/:id | Update a minute record |
| DELETE | /api/minutes/:id | Delete a minute record |
| POST | /api/minutes/:id/summarize | Generate AI summary for a minute |
| POST | /api/minutes/:id/transcribe | Upload audio recording and trigger AI transcription |

## Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| /minutes | Minutes.tsx | Minutes list view with search/filter |
| /minutes/:id | MinuteDetail.tsx | Minute detail/edit view |
| /minutes/new | MinuteDetail.tsx | Create new meeting minutes |
| /projects/:projectId/minutes | Minutes.tsx | Project-scoped minutes list |
| /projects/:projectId/minutes/:minuteId | MinuteDetail.tsx | Project-scoped minute detail |

## Known Issues / Future Enhancements
- [ ] No PDF export for meeting minutes
- [ ] No email distribution of minutes to attendees
- [ ] No meeting agenda template functionality
- [ ] No recurring meeting support
- [ ] No integration with calendar for automatic meeting creation
- [ ] No version history for minute edits
- [ ] No real-time collaborative editing of minutes

## Change Log
| Date | Change | Author |
|------|--------|--------|
| 2025-02-20 | Initial creation | BuildPro Team |

## Implementation Coverage Summary
- Total Stories: 16
- Implemented: 16
- Partially Implemented: 0
- Not Implemented: 0
