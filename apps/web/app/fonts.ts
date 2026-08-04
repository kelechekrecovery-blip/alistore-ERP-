// Keep the type contract used by Tailwind without making production builds depend
// on a network request to Google Fonts. The CSS variables are defined in
// globals.css and use system stacks until approved font files are vendored.
export const fontDisplay = { variable: 'font-display' };
export const fontSans = { variable: 'font-sans' };
export const fontMono = { variable: 'font-mono' };
