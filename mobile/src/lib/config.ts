// Dirección pública de la versión web (GitHub Pages). Se usa en los links de invitación.
export const WEB_URL = "https://ricardosalmeron71-png.github.io/sports-picks";

export const inviteLink = (code: string) => `${WEB_URL}/group/join?code=${code}`;

export const inviteMessage = (groupName: string, code: string) =>
  `¡Únete a mi grupo "${groupName}" en Sports Picks! 🏆\n\nCódigo: ${code}\nLink: ${inviteLink(code)}\n\nEn la app: Grupos → Unirme → escribe el código.`;
