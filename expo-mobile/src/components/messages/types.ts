// Shared types for channel messages (Messages screens + message components).
// Field names mirror the server payloads exactly (server/routes.ts messages
// section + shared/schema.ts messageAttachments / messageReactions).

export interface MessageAttachment {
  id: string;
  messageId: string;
  /** Served URL, e.g. /objects/company/:cid/uploads/:uuid — needs auth headers. */
  fileUrl: string;
  fileName: string;
  fileSize?: number | null;
  mimeType?: string | null;
  objectPath: string;
  createdAt?: string;
}

export interface MessageReaction {
  id: string;
  messageId: string;
  userId: string;
  /** One of: thumbs_up | check | eyes | heart | smile | fire */
  emoji: string;
  userFirstName?: string | null;
  userLastName?: string | null;
  createdAt?: string;
}

/** A row from GET /api/channels/:channelId/members (shared/schema.ts channelMembers). */
export interface ChannelMember {
  id: string;
  channelId: string;
  userId: string;
  /** "owner" | "admin" | "member" — owners/admins may unpin anyone's message. */
  role: string;
  isPinned: boolean;
  /** Drives read receipts: null until the member has opened the channel once. */
  lastReadAt?: string | null;
  joinedAt?: string;
}

export interface Message {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  createdAt: string;
  userFirstName?: string | null;
  userLastName?: string | null;
  userEmail?: string | null;
  isEdited?: boolean;
  mentions?: string[];
  attachments?: MessageAttachment[];
  /** Pinned messages surface in the thread banner (GET /api/channels/:id/pinned). */
  isPinned?: boolean;
  pinnedAt?: string | null;
  pinnedByUserId?: string | null;
  /** Optimistic message: POST in flight. */
  pending?: boolean;
  /** Optimistic message: POST failed — tap to retry, x to discard. */
  failed?: boolean;
  /** Optimistic message: local image URIs awaiting upload (render before attachments exist). */
  localUris?: string[];
  /** Optimistic message: human-readable upload status, e.g. "Uploading 1 of 2…". */
  uploadStatus?: string;
}
