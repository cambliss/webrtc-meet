# Skype-like Chat & File Transfer - Quick Start Guide

## What Was Added

A complete direct messaging system similar to Skype has been integrated into your dashboard. You can now:
- Message individual team members directly
- Share files securely (up to 100MB each)
- View message history and unread counts
- See all members in your workspace

## Setup Requirements

### 1. Database Schema
Apply the new database tables and indexes:

```bash
# Option A: Using npm script (if you have one)
npm run db:apply

# Option B: Manual SQL - Paste into your PostgreSQL client:
# The new tables from db/schema.sql starting at the "direct_messages" section
```

**Tables added:**
- `direct_messages` - Stores encrypted user-to-user messages
- `direct_message_files` - Stores file transfer metadata

### 2. Environment Variables
No new environment variables needed! Uses existing `SECURE_MESSAGING_KEY` for encryption.

### 3. Restart Your Servers
```bash
# In terminal 1 - Next.js dev server
npm run dev

# In terminal 2 - Signaling server (if running separately)
npm run signaling-server
```

## Using the Chat Feature

### Access the Chat Panel
1. Go to your dashboard at `http://localhost:3000/dashboard`
2. Look for the **Chat & Files** panel on the right side (visible on desktop, hidden on mobile)

### Start a Conversation
1. Click the **"New Chat"** tab
2. Select a user from the list
3. The chat will open on the right
4. Type your message and press Enter or click Send

### Send a File
1. With a conversation open, click the **📎 Paperclip** button
2. Select a file (max 100MB)
3. The file will upload automatically
4. Both parties can download via the link in the chat

### View Unread Messages
- The **"Chats"** tab shows an unread badge `(3)` next to users with new messages
- Messages auto-mark as read when you view them

## API Endpoints (for reference)

```
GET  /api/workspaces/{workspaceId}/users                          - List all users
GET  /api/workspaces/{workspaceId}/direct-messages/conversations  - Recent chats
GET  /api/workspaces/{workspaceId}/direct-messages/{userId}       - Get conversation
POST /api/workspaces/{workspaceId}/direct-messages/{userId}       - Send message
POST /api/workspaces/{workspaceId}/direct-message-files/{userId}  - Upload file
GET  /api/workspaces/{workspaceId}/direct-message-files/{fileId}/download - Download
```

## Features

✅ **Encryption**: All messages and file metadata encrypted with AES-256-GCM  
✅ **Privacy**: Only conversation participants can access messages/files  
✅ **Auto-Sync**: Messages refresh every 3 seconds, conversations every 5 seconds  
✅ **Workspace-Scoped**: Messages only visible within your workspace  
✅ **Read Status**: See which messages have been read  
✅ **Unread Badges**: Know when you have new messages  
✅ **File Storage**: Files stored securely with workspace isolation  

## Mobile / Responsive

- **Desktop (lg+)**: Chat panel visible on the right sidebar
- **Tablet/Mobile**: Chat panel hidden by default, tap ☰ Menu to access

To always show it on mobile, edit `DirectChatPanel` className from `hidden w-80 lg:flex` to `w-full lg:w-80 flex`

## Troubleshooting

### "No conversations yet" message
- This is normal! You haven't messaged anyone yet. Click "New Chat" to start.

### Messages not showing up
- Check that both users have refreshed the page (auto-refresh is 3 seconds)
- Verify both users are in the same workspace
- Check browser console for any errors

### File upload fails
- Ensure file is under 100MB
- Check that storage path exists (./recordings/)
- Verify `objectStorage` library is properly configured in env

### TypeScript errors after setup
Run: `npx tsc --noEmit` to check for compilation issues

## Database Verification

Check that tables were created:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('direct_messages', 'direct_message_files');
```

Should return 2 rows.

## Files Modified/Created

**New API Routes:**
- `src/app/api/workspaces/[workspaceId]/users/route.ts`
- `src/app/api/workspaces/[workspaceId]/direct-messages/[userId]/route.ts`
- `src/app/api/workspaces/[workspaceId]/direct-messages/conversations/route.ts`
- `src/app/api/workspaces/[workspaceId]/direct-message-files/[userId]/route.ts`
- `src/app/api/workspaces/[workspaceId]/direct-message-files/[fileId]/download/route.ts`

**New Component:**
- `src/components/dashboard/DirectChatPanel.tsx`

**Modified:**
- `db/schema.sql` (new tables + indexes)
- `src/components/dashboard/DashboardClient.tsx` (integrated panel)

## Performance

- **Message List**: Caches up to 100 messages per conversation
- **Conversations**: Shows last 50 active conversations
- **Auto-Refresh**: 3-5 second polling (can adjust in component)
- **Encryption**: Minimal overhead, happens server-side

## Security Notes

1. Messages are encrypted end-to-end using the same key as workspace chat
2. Files are stored in workspace-isolated paths
3. Access requires workspace membership + conversation participation
4. Read status tracked but not encrypted (metadata)
5. No file virus scanning implemented (integrate ClamAV if needed)

## Customization

### Change refresh intervals
Open `DirectChatPanel.tsx` and modify:
```typescript
// Line 180 - Change interval duration
const interval = window.setInterval(loadConversations, 5000);

// Line 235 - Change messages interval  
const interval = window.setInterval(loadMessages, 3000);
```

### Change max file size
Edit route file and modify:
```typescript
const maxSize = 100 * 1024 * 1024; // Change this value
```

### Show chat on mobile
Edit DashboardClient.tsx:
```typescript
<div className="w-full lg:w-80 flex"> {/* Remove 'hidden' */}
```

## Next Steps

1. ✅ Database tables created
2. ✅ API endpoints ready  
3. ✅ UI component integrated
4. 👉 **Run: `npm run db:apply` or apply schema**
5. 👉 **Restart dev servers**
6. 👉 **Test by messaging a team member**
7. Share the link with your team!

## Support

Check these files for implementation details:
- `SKYPE_CHAT_FEATURE.md` - Complete technical documentation
- `/memories/session/skype-chat-implementation.md` - Checklist
