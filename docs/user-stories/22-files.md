# Files & Document Management - User Stories

## Epic Overview
Files & Document Management provides two distinct file management areas: Project Files (scoped to individual construction projects) and Business Files (company-wide documents). The system integrates with Google Drive for cloud storage and uses Object Storage with presigned URLs for direct file uploads, enabling builders to organise contracts, drawings, photos, and compliance documents efficiently.

## Business Value
Australian residential builders deal with extensive documentation including council approvals, building permits, engineering drawings, contracts, site photos, and compliance certificates. Having centralised file management with both local upload capability and Google Drive integration ensures critical documents are always accessible on-site or in the office. Activity logging provides an audit trail for regulatory compliance and dispute resolution, while entity-based attachments connect files directly to relevant projects, tasks, or contacts.

## User Personas
| Persona | Role | Goals |
|---------|------|-------|
| Builder/PM | Project Manager | Organise and access project documents, drawings, and photos |
| Admin | Office Administrator | Manage company-wide business documents and compliance files |
| Site Supervisor | Field Manager | Upload site photos and access drawings on-site |
| Subcontractor | Trade Contractor | Access relevant project files shared by the builder |

## User Stories

### US-FI001: Upload Files via Object Storage
**As a** Builder/PM, **I want to** upload files directly using presigned URLs, **so that** I can store project documents without file size limitations of traditional uploads.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Request a presigned upload URL via POST /api/uploads/request-url
- [ ] Upload file directly to Object Storage using the presigned URL
- [ ] Support common file types (PDF, images, documents, spreadsheets)
- [ ] Show upload progress indicator during file transfer
- [ ] Handle upload errors gracefully with retry option

---

### US-FI002: Connect Google Drive Account
**As an** Admin, **I want to** connect my company's Google Drive account, **so that** my team can access and manage files stored in Drive.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Initiate OAuth flow via GET /api/google-drive/auth-url
- [ ] Complete authentication callback via GET /api/google-drive/callback
- [ ] Store credentials securely via POST /api/google-drive/credentials
- [ ] Show connection status indicator (connected/disconnected)
- [ ] Display connected Google account details

---

### US-FI003: Check Google Drive Connection Status
**As a** Builder/PM, **I want to** see if Google Drive is connected, **so that** I know whether cloud file features are available.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Check connection status via GET /api/google-drive/status
- [ ] Display connected/disconnected badge in file management UI
- [ ] Show "Connect Google Drive" prompt when not connected
- [ ] Indicate when credentials need re-authentication

---

### US-FI004: Disconnect Google Drive
**As an** Admin, **I want to** disconnect the Google Drive integration, **so that** I can revoke access or switch to a different account.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Disconnect via POST /api/google-drive/disconnect
- [ ] Revoke stored OAuth credentials
- [ ] Update UI to show disconnected state
- [ ] Show confirmation dialog before disconnecting

---

### US-FI005: Browse Google Drive Files
**As a** Builder/PM, **I want to** browse files and folders in my Google Drive, **so that** I can find and access project documents stored in the cloud.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] List files and folders via GET /api/google-drive/files
- [ ] Support folder navigation with breadcrumb trail
- [ ] Display file name, type, size, and last modified date
- [ ] Show file type icons for different document types
- [ ] Support pagination for large directories

---

### US-FI006: Navigate Folder Structure
**As a** Builder/PM, **I want to** navigate through nested folders in Google Drive, **so that** I can find documents in my organised folder structure.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Click folders to navigate into them
- [ ] Display folder path breadcrumb via GET /api/google-drive/folder-path/:folderId
- [ ] Navigate back to parent folders via breadcrumb
- [ ] Show current folder name in header

---

### US-FI007: View File Details
**As a** Builder/PM, **I want to** view details of a specific file, **so that** I can see metadata and preview information.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Retrieve file details via GET /api/google-drive/files/:fileId
- [ ] Display file name, type, size, owner, and dates
- [ ] Show thumbnail preview where available
- [ ] Provide link to open file in Google Drive

---

### US-FI008: Create Folders in Google Drive
**As a** Builder/PM, **I want to** create new folders in Google Drive, **so that** I can organise project documents systematically.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Create folder via POST /api/google-drive/folders
- [ ] Specify parent folder for nested organisation
- [ ] Name the new folder with validation
- [ ] Refresh file listing to show new folder
- [ ] Support creating project-specific folder structures

---

### US-FI009: Download Files from Google Drive
**As a** Site Supervisor, **I want to** download files from Google Drive, **so that** I can access drawings and documents offline on-site.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Download file via GET /api/google-drive/download/:fileId
- [ ] Handle large file downloads with streaming
- [ ] Preserve original file name and format
- [ ] Show download progress indicator

---

### US-FI010: Upload Files to Google Drive
**As a** Builder/PM, **I want to** upload files to Google Drive, **so that** I can store project documents in the cloud for team access.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Upload file via POST /api/google-drive/upload
- [ ] Select destination folder in Drive
- [ ] Support multiple file uploads
- [ ] Show upload progress and completion status
- [ ] Refresh file listing after successful upload

---

### US-FI011: Delete Files from Google Drive
**As a** Builder/PM, **I want to** delete files from Google Drive, **so that** I can remove outdated or incorrect documents.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Delete file via DELETE /api/google-drive/files/:fileId
- [ ] Show confirmation dialog before deletion
- [ ] Refresh file listing after deletion
- [ ] Handle permission errors gracefully

---

### US-FI012: Access Shared Drives
**As a** Builder/PM, **I want to** access shared Google Drives, **so that** I can manage files in team-shared storage.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] List shared drives via GET /api/google-drive/shared-drives
- [ ] Switch between personal Drive and shared drives
- [ ] Browse files within shared drives
- [ ] Respect shared drive permissions

---

### US-FI013: Set Root Folder for File Organisation
**As an** Admin, **I want to** set a root folder in Google Drive for my company, **so that** all BuildPro files are organised under a consistent location.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Set root folder via POST /api/google-drive/root-folder
- [ ] Browse and select existing folders as root
- [ ] Create new root folder if needed
- [ ] All subsequent file operations use the root folder as base

---

### US-FI014: Manage Project Files
**As a** Builder/PM, **I want to** manage files within a specific project context, **so that** I can keep all project documents organised together.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] View project-specific files in ProjectFiles.tsx
- [ ] Upload files directly to project folder
- [ ] Create project-specific subfolder structure
- [ ] Filter files by type (drawings, photos, contracts, etc.)
- [ ] Search files within project scope

---

### US-FI015: Manage Business Files
**As an** Admin, **I want to** manage company-wide business files separately from project files, **so that** I can organise templates, policies, and shared resources.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] View business files in BusinessFiles.tsx
- [ ] Upload company-wide documents
- [ ] Organise business files in folders (templates, policies, insurance, etc.)
- [ ] Business files accessible across all projects
- [ ] Search business files independently

---

### US-FI016: Attach Files to Entities
**As a** Builder/PM, **I want to** attach files to specific entities (tasks, contacts, variations), **so that** relevant documents are linked to their context.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Create file attachment via driveFileAttachments with entityType and entityId
- [ ] Store driveFileId, fileName, fileType, driveFileUrl, and thumbnailUrl
- [ ] Display attached files on entity detail views
- [ ] Support multiple attachments per entity
- [ ] Remove attachments without deleting the source file

---

### US-FI017: Track File Activity
**As a** Builder/PM, **I want to** see an activity log for file operations, **so that** I have an audit trail of who uploaded, downloaded, or modified documents.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Log file actions in driveFileActivityLogs
- [ ] Track upload, download, delete, and view events
- [ ] Record user, timestamp, and action details
- [ ] Display activity log in file management UI
- [ ] Filter activity by file or by user

---

### US-FI018: Search and Filter Files
**As a** Builder/PM, **I want to** search and filter files across projects, **so that** I can quickly find specific documents.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Search files by name
- [ ] Filter by file type (PDF, image, document, spreadsheet)
- [ ] Sort files by name, date modified, or size
- [ ] Real-time search results as user types

---

## Technical Notes
- Object Storage uses presigned URLs for direct browser-to-storage uploads, bypassing server for large files
- Google Drive integration uses OAuth 2.0 with refresh token for persistent access
- File attachments use a polymorphic pattern with entityType/entityId for flexible entity linking
- driveFileAttachments stores metadata (fileName, fileType, driveFileUrl, thumbnailUrl) without duplicating file content
- driveFileActivityLogs provides audit trail for compliance requirements
- ProjectFiles.tsx (1177 lines) handles project-scoped file management
- BusinessFiles.tsx (1077 lines) handles company-wide file management
- Uppy library used on frontend for file upload UX (drag-and-drop, progress, multi-file)

## API Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/uploads/request-url | Request presigned URL for Object Storage upload |
| GET | /api/google-drive/status | Check Google Drive connection status |
| POST | /api/google-drive/credentials | Store Google Drive OAuth credentials |
| GET | /api/google-drive/auth-url | Get Google Drive OAuth authorization URL |
| GET | /api/google-drive/callback | Handle Google Drive OAuth callback |
| POST | /api/google-drive/disconnect | Disconnect Google Drive integration |
| GET | /api/google-drive/shared-drives | List available shared drives |
| POST | /api/google-drive/root-folder | Set root folder for file organisation |
| GET | /api/google-drive/files | List files and folders in Google Drive |
| GET | /api/google-drive/folder-path/:folderId | Get folder breadcrumb path |
| GET | /api/google-drive/files/:fileId | Get file details |
| POST | /api/google-drive/folders | Create a new folder |
| GET | /api/google-drive/download/:fileId | Download a file |
| DELETE | /api/google-drive/files/:fileId | Delete a file |
| POST | /api/google-drive/upload | Upload a file to Google Drive |

## Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| /projects/:projectId/files | ProjectFiles.tsx | Project-scoped file management |
| /business/files | BusinessFiles.tsx | Company-wide business file management |

## Known Issues / Future Enhancements
- [ ] No file versioning or version history tracking
- [ ] No file preview for common formats (PDF, images) within the app
- [ ] No bulk file operations (download multiple, move multiple)
- [ ] No file sharing with external parties (clients, subcontractors) via links
- [ ] No integration with other cloud storage providers (Dropbox, OneDrive)
- [ ] No automatic folder structure creation for new projects
- [ ] No file size quota management per project or company
- [ ] No OCR or content search within uploaded documents

## Change Log
| Date | Change | Author |
|------|--------|--------|
| 2025-02-20 | Initial creation | BuildPro Team |

## Implementation Coverage Summary
- Total Stories: 18
- Implemented: 18
- Partially Implemented: 0
- Not Implemented: 0
