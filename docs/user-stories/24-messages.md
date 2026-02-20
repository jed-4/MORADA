# Messages (Real-time Chat) - User Stories

## Epic Overview
Messages provides a channel-based real-time communication system built on Socket.io. The system supports project-specific channels, company-wide channels, and direct messages (DMs) between team members. It includes threading, @mentions, typing indicators, presence detection, unread counts, and message pinning, enabling construction teams to collaborate without leaving the application.

## Business Value
Australian residential builders coordinate across multiple trades, suppliers, and team members daily. Having built-in messaging eliminates the need for fragmented communication across WhatsApp, email, and SMS. Project channels ensure all project-related discussions are captured and searchable, providing context for decisions and a record of communications. Client-facing channels enable controlled communication with homeowners, while DMs handle private team conversations. Real-time delivery ensures urgent site issues are communicated immediately.

## User Personas
| Persona | Role | Goals |
|---------|------|-------|
| Builder/PM | Project Manager | Coordinate team activities, communicate with clients via channels |
| Site Supervisor | Field Manager | Report site issues in real-time, communicate with trades |
| Admin | Office Administrator | Manage company channels, monitor team communications |
| Team Member | General User | Send/receive messages, participate in project discussions |

## User Stories

### US-MS001: Create a Project Channel
**As a** Builder/PM, **I want to** create a messaging channel for a project, **so that** the project team can discuss project-specific topics.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Create channel with name, description, and associated projectId
- [ ] Set channel type to "channel"
- [ ] Auto-add project team members to the channel
- [ ] Channel appears in the project's messaging section
- [ ] Create via POST /api/channels

---

### US-MS002: Create a Company Channel
**As an** Admin, **I want to** create company-wide channels, **so that** the entire team can communicate on cross-project topics.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Create channel with companyId and no projectId
- [ ] Available to all company team members
- [ ] Support general channels (announcements, general discussion)
- [ ] Channel visible in company messaging section

---

### US-MS003: Start a Direct Message
**As a** Team Member, **I want to** start a direct message conversation with another team member, **so that** I can have private one-on-one discussions.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Create DM channel via POST /api/channels/dm
- [ ] Set channel type to "dm" with dmParticipants JSON
- [ ] Prevent duplicate DM channels between the same participants
- [ ] DM appears in messaging sidebar under "Direct Messages"
- [ ] Display other participant's name as channel name

---

### US-MS004: Send a Message
**As a** Team Member, **I want to** send a message in a channel, **so that** I can communicate with my team.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Compose and send message via POST /api/channels/:channelId/messages
- [ ] Message includes content text, userId, and timestamp
- [ ] Message appears in channel immediately for the sender
- [ ] Cache user display name and avatar on message record
- [ ] Support multi-line messages

---

### US-MS005: Receive Messages in Real-time
**As a** Team Member, **I want to** receive messages instantly without refreshing, **so that** I can have fluid conversations.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Socket.io connection delivers new messages in real-time
- [ ] Messages appear at bottom of chat without page refresh
- [ ] Auto-scroll to newest message on arrival
- [ ] Handle reconnection after temporary network loss
- [ ] Socket managed via server/messaging/socket.ts and server/socketManager.ts

---

### US-MS006: View Message History
**As a** Team Member, **I want to** view the message history of a channel, **so that** I can catch up on discussions I missed.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Load messages via GET /api/channels/:channelId/messages
- [ ] Display messages chronologically with user avatars and timestamps
- [ ] Support pagination for older messages
- [ ] Show date separators between different days
- [ ] Display sender name and role

---

### US-MS007: Reply in Threads
**As a** Builder/PM, **I want to** reply to a specific message in a thread, **so that** I can keep related discussions organised.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Set threadParentId on reply message to create a thread
- [ ] Display thread count on parent message
- [ ] Open thread panel to view threaded replies
- [ ] Thread replies do not clutter the main channel feed
- [ ] Navigate between main channel and thread views

---

### US-MS008: Mention Team Members
**As a** Builder/PM, **I want to** @mention team members in messages, **so that** I can direct specific messages to their attention.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Type @ to trigger user autocomplete
- [ ] Store mentions as JSON array on message record
- [ ] Highlighted mention display in message content
- [ ] Mentioned users receive notification
- [ ] Support mentioning multiple users in one message

---

### US-MS009: Edit a Message
**As a** Team Member, **I want to** edit a message I sent, **so that** I can correct typos or update information.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Edit message via PATCH /api/messages/:id
- [ ] Only the message author can edit their own messages
- [ ] Set isEdited flag to true on the message
- [ ] Display "(edited)" indicator on modified messages
- [ ] Update message content in real-time for other viewers

---

### US-MS010: Delete a Message
**As a** Team Member, **I want to** delete a message I sent, **so that** I can remove incorrect or inappropriate content.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Delete message via DELETE /api/messages/:id
- [ ] Only message author or channel admin can delete messages
- [ ] Set isDeleted flag (soft delete)
- [ ] Display "This message was deleted" placeholder
- [ ] Remove message from real-time feed for other viewers

---

### US-MS011: Pin Channels
**As a** Team Member, **I want to** pin important channels, **so that** they appear at the top of my channel list for quick access.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Pin/unpin channel via POST /api/channels/:channelId/pin
- [ ] Set isPinned flag on channelMembers record
- [ ] Pinned channels appear in a separate section at top
- [ ] Pin state is per-user (personal preference)

---

### US-MS012: Track Unread Message Counts
**As a** Team Member, **I want to** see unread message counts on channels, **so that** I know which conversations have new activity.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Track unreadCount on channelMembers record
- [ ] Fetch unread counts via GET /api/channels/unread/counts
- [ ] Display badge with unread count on each channel
- [ ] Increment count on new message received
- [ ] Reset count when channel is opened/read

---

### US-MS013: Mark Channel as Read
**As a** Team Member, **I want to** mark a channel as read, **so that** unread indicators are cleared.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Mark read via POST /api/channels/:channelId/read
- [ ] Update lastReadAt timestamp on channelMembers
- [ ] Set lastSeenMessageId to the latest message
- [ ] Reset unreadCount to zero
- [ ] Auto-mark as read when channel is opened

---

### US-MS014: Manage Channel Members
**As a** Builder/PM, **I want to** add and remove members from a channel, **so that** I can control who participates in project discussions.

**Priority:** High | **Status:** Implemented

**Acceptance Criteria:**
- [ ] List members via GET /api/channels/:channelId/members
- [ ] Add member via POST /api/channels/:channelId/members
- [ ] Remove member via DELETE /api/channels/:channelId/members/:userId
- [ ] Display member list with roles and online status
- [ ] Only channel creator or admin can manage members

---

### US-MS015: See Typing Indicators
**As a** Team Member, **I want to** see when someone is typing in a channel, **so that** I know a response is coming.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Broadcast typing event via Socket.io when user is typing
- [ ] Display "[User] is typing..." indicator in channel
- [ ] Auto-clear typing indicator after timeout
- [ ] Support multiple simultaneous typing indicators
- [ ] Only show typing for the active channel

---

### US-MS016: See Online Presence
**As a** Team Member, **I want to** see which team members are online, **so that** I know who is available for immediate communication.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Track user connection via Socket.io presence
- [ ] Display online/offline status indicator on user avatars
- [ ] Update presence in real-time as users connect/disconnect
- [ ] Show presence in channel member list and DM sidebar

---

### US-MS017: Archive a Channel
**As a** Builder/PM, **I want to** archive a channel when a project is complete, **so that** it is preserved but doesn't clutter the active channels list.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Set isArchived flag on channel via PATCH /api/channels/:id
- [ ] Archived channels hidden from default channel list
- [ ] Archived channels remain searchable and viewable
- [ ] Option to unarchive if needed
- [ ] Prevent new messages in archived channels

---

### US-MS018: Create Client-Facing Channels
**As a** Builder/PM, **I want to** create client-facing channels, **so that** I can communicate with homeowners within the project context.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Set isClientFacing flag on channel
- [ ] Client-facing channels visible to invited clients
- [ ] Distinguish client-facing channels visually in the UI
- [ ] Control what content is visible in client-facing channels

---

### US-MS019: Seed Sample Channels
**As a** Builder/PM, **I want to** have sample channels created for new setups, **so that** I can see how messaging works with example content.

**Priority:** Low | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Seed sample channels via POST /api/channels/seed-sample
- [ ] Create example project and general channels
- [ ] Include sample messages to demonstrate features
- [ ] Sample channels can be deleted or archived

---

### US-MS020: View Recent Messages
**As a** Team Member, **I want to** see recent messages across all channels, **so that** I can quickly review the latest activity.

**Priority:** Medium | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Fetch recent messages via GET /api/messages/recent
- [ ] Show messages from all channels the user is a member of
- [ ] Display channel name alongside each message
- [ ] Sort by most recent first
- [ ] Navigate to channel on message click

---

### US-MS021: Use Bot Commands
**As a** Builder/PM, **I want to** use bot commands in channels, **so that** I can trigger automated actions from within the chat.

**Priority:** Low | **Status:** Implemented

**Acceptance Criteria:**
- [ ] Detect command syntax in message content
- [ ] Set hasCommand and commandType flags on message
- [ ] Process command on the backend
- [ ] Display command result in the channel
- [ ] Support common commands relevant to construction workflows

---

## Technical Notes
- Real-time messaging powered by Socket.io via server/messaging/socket.ts and server/socketManager.ts
- Messages store cached user info (display name, avatar) for performance
- Threading uses threadParentId and threadCount fields on messages
- Mentions stored as JSON array on message record for notification processing
- Channel types: "channel" (group) and "dm" (direct message)
- DM participants stored as JSON array on channel record
- channelMembers tracks per-user state: lastReadAt, isPinned, lastSeenMessageId, unreadCount
- Soft delete for messages (isDeleted flag) preserves thread integrity
- Messages.tsx (1148 lines) is the primary frontend component
- Socket connection handles reconnection and state synchronisation automatically

## API Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/channels | List all channels for the user |
| POST | /api/channels | Create a new channel |
| GET | /api/channels/:id | Get channel details |
| PATCH | /api/channels/:id | Update channel (name, description, archive) |
| DELETE | /api/channels/:id | Delete a channel |
| POST | /api/channels/dm | Create or get a DM channel |
| POST | /api/channels/seed-sample | Seed sample channels with demo data |
| GET | /api/channels/:channelId/members | List channel members |
| POST | /api/channels/:channelId/members | Add a member to a channel |
| DELETE | /api/channels/:channelId/members/:userId | Remove a member from a channel |
| POST | /api/channels/:channelId/read | Mark channel as read |
| POST | /api/channels/:channelId/pin | Pin/unpin a channel |
| GET | /api/channels/unread/counts | Get unread message counts |
| GET | /api/channels/:channelId/messages | Get messages for a channel |
| POST | /api/channels/:channelId/messages | Send a message in a channel |
| GET | /api/messages/:id | Get a single message |
| PATCH | /api/messages/:id | Edit a message |
| DELETE | /api/messages/:id | Delete a message |
| GET | /api/messages/recent | Get recent messages across all channels |

## Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| /messages | Messages.tsx | Real-time messaging interface with channels and DMs |

## Known Issues / Future Enhancements
- [ ] No file/image sharing in messages
- [ ] No message reactions (thumbs up, etc.)
- [ ] No message search across channels
- [ ] No voice or video calling integration
- [ ] No message forwarding between channels
- [ ] No scheduled/delayed messages
- [ ] No read receipts showing which users have read a message
- [ ] No push notifications for mobile devices
- [ ] No message bookmarking/saving
- [ ] No channel categories or grouping

## Change Log
| Date | Change | Author |
|------|--------|--------|
| 2025-02-20 | Initial creation | BuildPro Team |

## Implementation Coverage Summary
- Total Stories: 21
- Implemented: 21
- Partially Implemented: 0
- Not Implemented: 0
