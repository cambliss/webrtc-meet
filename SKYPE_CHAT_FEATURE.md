# Skype-like Chat & File Transfer Feature Implementation

## Overview
Added a complete direct messaging and file sharing system to the dashboard, similar to Skype's interface. Users can:
- See all registered team members
- Chat directly with individual users
- Share files securely
- View conversation history

## Database Changes

### New Tables
1. **direct_messages** - Encrypted user-to-user messages
   - Sender & recipient user IDs
   - Encrypted message content (AES-256-GCM)
   - Read status tracking
   - Workspace scoped

2. **direct_message_files** - User-to-user file transfers
   - Sender & recipient user IDs
   - File metadata (size, type, original name)
   - Storage path reference
   - Read status tracking
   - Max 100MB per file

### Indexes
- Indexed on (workspace_id, recipient_user_id) for fast lookups
- Indexed on conversation tuple for message history

## API Endpoints Created

### Users
- **GET** `/api/workspaces/{workspaceId}/users` - List all users in workspace

### Direct Messages
- **GET** `/api/workspaces/{workspaceId}/direct-messages/{userId}` - Fetch conversation with a user
  - Automatically marks messages as read
- **POST** `/api/workspaces/{workspaceId}/direct-messages/{userId}` - Send a message to user

### Direct Message Files
- **POST** `/api/workspaces/{workspaceId}/direct-message-files/{userId}` - Upload file to user
  - Max 100MB limit
  - Auto-encrypts in storage
- **GET** `/api/workspaces/{workspaceId}/direct-message-files/{fileId}/download` - Download file
  - Marks file as read
  - Sets proper content-disposition headers

### Conversations
- **GET** `/api/workspaces/{workspaceId}/direct-messages/conversations` - Get recent conversations
  - Shows unread count per user
  - Orders by last activity
  - Limits to 50 conversations

## UI Components

### DirectChatPanel.tsx
- Responsive right sidebar showing:
  - **Recent Conversations Tab** - Cached list of users you've messaged
  - **New Chat Tab** - Browse all workspace users to start a conversation
  - **Chat Interface** - Message thread display
  - **File Sharing** - Drag/paste files or click to upload
  - Message timestamps and read status

### Integration
- Added to dashboard right sidebar (hidden on mobile, visible on lg+ screens)
- Auto-refreshes conversations every 5 seconds
- Auto-refreshes messages every 3 seconds
- Real-time message display with smooth scroll-to-bottom

## Security Features

1. **End-to-end Encryption**
   - Messages encrypted with AES-256-GCM
   - Uses SECURE_MESSAGING_KEY environment variable
   - IV and auth tag stored separately

2. **Access Control**
   - Verified workspace membership required
   - Only conversation participants can access messages/files
   - recipient-only visibility for files

3. **Storage**
   - Files stored in workspace-scoped paths
   - Uses objectStorage abstraction (local or S3)
   - Proper content-type and disposition headers

## Configuration

Required environment variable (already exists):
```
SECURE_MESSAGING_KEY=your-secret-key
```

## Database Migration

Run the updated schema:
```sql
npm run db:apply
```

Or manually apply the new tables and indexes from db/schema.sql

## Usage Example

1. Click "New Chat" tab in right sidebar
2. Select a user from the list
3. Type a message and send
4. Or attach a file with the 📎 button
5. View conversation history automatically
6. Unread count badge shows on the Chats tab

## Features

- ✅ User list browsing
- ✅ Encrypted direct messages
- ✅ File uploads (100MB max)
- ✅ Conversation history
- ✅ Unread message tracking
- ✅ Auto-refresh (3-5 second poll)
- ✅ Read receipts
- ✅ Message timestamps
- ✅ Responsive design

## Technical Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Backend**: Next.js API routes
- **Database**: PostgreSQL
- **Encryption**: Node.js crypto (AES-256-GCM)
- **Storage**: Local filesystem or S3 (via objectStorage abstraction)

## Notes

- Messages sync every 3 seconds (configurable)
- Conversations sync every 5 seconds
- All messages encrypted at rest
- Mobile users see sidebar as hidden (can be toggled in DashboardShell)
- File downloads are streamed directly from storage
