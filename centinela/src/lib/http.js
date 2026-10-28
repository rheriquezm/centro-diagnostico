export async function request(url, options = {}) {
  const {
    method = "GET",
    body,
    timeout = 15000,
    headers = {},
    retries = 1,
  } = options;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        method,
        body,
        headers: {
          "User-Agent": "Centinela/1.0 (+local)",
          Accept: "application/json, text/xml, application/xml, text/html, */*",
          ...headers,
        },
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          throw new Error(`HTTP ${response.status}`);
        }
        return { ok: false, status: response.status, text };
      }
      return { ok: true, status: response.status, text };
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("Error de red");
}

export async function getJson(url, options = {}) {
  const result = await request(url, options);
  if (!result.ok) throw new Error(`HTTP ${result.status}`);
  return JSON.parse(result.text);
}

export async function postJson(url, payload, options = {}) {
  const result = await request(url, {
    ...options,
    method: "POST",
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!result.ok) throw new Error(`HTTP ${result.status}`);
  return JSON.parse(result.text);
}
