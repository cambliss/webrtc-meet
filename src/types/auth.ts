export type UserRole = "host" | "participant";

export type AppUser = {
  id: string;
  username: string;
  role: UserRole;
  workspaceId: string;
  avatarPath?: string | null;
};
