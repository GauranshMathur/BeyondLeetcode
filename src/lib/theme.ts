export type Theme = 'light' | 'dark';

export const THEME_COOKIE = 'theme';

/** The cookie holds light or dark; anything else, or no cookie, means follow the device. */
export function parseTheme(value: string | undefined): Theme | null {
	return value === 'light' || value === 'dark' ? value : null;
}

/** Marks the root element so the server render is already in the chosen theme. */
export function withTheme(html: string, theme: Theme | null): string {
	return theme ? html.replace('<html lang="en"', `<html lang="en" data-theme="${theme}"`) : html;
}
