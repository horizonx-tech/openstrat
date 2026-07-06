const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0b0f14"/>
  <path d="M16 42h8l7-20 9 28 7-18h5" fill="none" stroke="#44d7b6" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export function GET(): Response {
  return new Response(favicon, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "image/svg+xml"
    }
  });
}
