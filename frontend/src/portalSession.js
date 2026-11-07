// Sign-in session for the customer infrastructure portal (not the /admin one).
const KEY = "cloudledger_portal_token";
const API = import.meta.env.VITE_API_URL || "";

export const getPortalToken = () => {
  try {
    return sessionStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
};
export const setPortalToken = (token) => {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    /* storage blocked: the session lasts until the page reloads */
  }
};
export function signOutPortal() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("portal-signed-out"));
}
export const portalHeaders = (extra = {}) => ({
  ...extra,
  Authorization: `Bearer ${getPortalToken()}`,
});

/** fetch() for portal data; a 401 signs the user out so the login page appears. */
export async function portalFetch(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: portalHeaders(options.headers),
  });
  if (response.status === 401) signOutPortal();
  return response;
}

/** Downloads a protected file (the browser can't send the sign-in header on a plain link). */
export async function downloadPortalFile(path, fallbackName = "invoice.pdf") {
  const response = await portalFetch(path);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "The file could not be downloaded.");
  }
  const blob = await response.blob();
  const name =
    /filename="([^"]+)"/.exec(
      response.headers.get("Content-Disposition") || "",
    )?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function authCall(path, body) {
  const response = await fetch(`${API}/api/portal-auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.message || `Request failed (${response.status})`);
  return payload;
}
