import type { Config } from "tailwindcss";

const config: Config = {
	darkMode: ["class"],
	content: ["./src/**/*.{html,js,svelte,ts}"],
	safelist: ["dark"],
	theme: {
		container: {
			center: true,
			padding: "2rem",
			screens: { "2xl": "1400px" }
		},
		extend: {
			colors: {
				border:     "hsl(var(--border) / <alpha-value>)",
				input:      "hsl(var(--input) / <alpha-value>)",
				ring:       "hsl(var(--ring) / <alpha-value>)",
				background: "hsl(var(--background) / <alpha-value>)",
				foreground: "hsl(var(--foreground) / <alpha-value>)",
				lynt: {
					foreground: "hsl(var(--lynt-focus) / <alpha-value>)"
				},
				primary: {
					DEFAULT:    "hsl(var(--primary) / <alpha-value>)",
					foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
					top:        "hsl(var(--primary-top) / <alpha-value>)",
					dim:        "hsl(var(--primary-dim) / <alpha-value>)",
				},
				secondary: {
					DEFAULT:    "hsl(var(--secondary) / <alpha-value>)",
					foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
				},
				destructive: {
					DEFAULT:    "hsl(var(--destructive) / <alpha-value>)",
					foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
				},
				muted: {
					DEFAULT:    "hsl(var(--muted) / <alpha-value>)",
					foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
				},
				accent: {
					DEFAULT:    "hsl(var(--accent) / <alpha-value>)",
					foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
				},
				popover: {
					DEFAULT:    "hsl(var(--popover) / <alpha-value>)",
					foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
				},
				card: {
					DEFAULT:    "hsl(var(--card) / <alpha-value>)",
					foreground: "hsl(var(--card-foreground) / <alpha-value>)",
				},
			},
			borderRadius: {
				lg:  "var(--radius)",
				md:  "calc(var(--radius) - 2px)",
				sm:  "calc(var(--radius) - 4px)",
				xl:  "calc(var(--radius) + 4px)",
			},
			fontFamily: {
				// Work Sans for display, Inter for body — both loaded in app.css
				sans:    ['Inter', 'sans-serif'],
				display: ['Work Sans', 'sans-serif'],
			},
			boxShadow: {
				// Expose depth tokens as Tailwind utilities
				'inset-well': 'inset 0px 2px 4px rgba(60, 30, 0, 0.13)',
				'float':      '0 12px 32px -4px rgba(60, 30, 0, 0.12)',
				'gloss':      'inset 0 1px 0 rgba(255, 240, 210, 0.55), 0 12px 32px -4px rgba(60, 30, 0, 0.12)',
			},
			backgroundImage: {
				// Glossy button gradient — use as bg-gradient-gloss
				'gradient-gloss': 'linear-gradient(to bottom, hsl(var(--primary-top)), hsl(var(--primary)))',
				// Grid texture for body — also applied in app.css but available as utility
				'grid-texture': `
					linear-gradient(rgba(100,70,20,0.06) 1px, transparent 1px),
					linear-gradient(90deg, rgba(100,70,20,0.06) 1px, transparent 1px)
				`,
			},
			backgroundSize: {
				'grid': '28px 28px',
			},
		}
	},
};

export default config;
