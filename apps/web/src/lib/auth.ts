const TOKEN_KEY = "fin.token";
const GROUP_KEY = "fin.groupId";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getGroupId(): string | null {
  return localStorage.getItem(GROUP_KEY);
}

export function setGroupId(groupId: string) {
  localStorage.setItem(GROUP_KEY, groupId);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(GROUP_KEY);
}
