import { z } from "zod";

export const VoteOptionSchema = z.object({
  id:          z.string(),
  label:       z.string(),   // translation key, e.g. "option.support"
  description: z.string(),   // translation key
});

export const PolicySchema = z.object({
  id:                  z.string(),
  title:               z.string(),   // translation key or literal
  description:         z.string(),   // translation key or literal
  category:            z.enum(["healthcare","education","economy","environment",
                                "defence","infrastructure","justice","other"]),
  documentIpfsCID:     z.string().optional(),
  votingDeadlineISO:   z.string(),
  options:             z.array(VoteOptionSchema),
});

export const BrandingSchema = z.object({
  /** Primary action colour — hex */
  primaryColor:            z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  /** Secondary / accent colour — hex */
  secondaryColor:          z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  /** Surface / card background — hex */
  surfaceColor:            z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  /** On-primary text colour — hex */
  onPrimaryColor:          z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  /** Whether the app header should use a dark (true) or light (false) status bar */
  darkStatusBar:           z.boolean(),
  /** Official government digital service portal name */
  governmentPortalName:    z.string(),
  /** Public URL of the government's digital service portal */
  governmentPortalURL:     z.string().url(),
  /** Accessible description of the government logo / crest */
  governmentLogoAlt:       z.string(),
  /** National flag colours as a human-readable list */
  flagColors:              z.array(z.string()),
  /** Font family name to use in headers (must be available on the device, or fall back to system) */
  headerFontFamily:        z.string().optional(),
});

export const CountryConfigSchema = z.object({
  code:           z.string().length(2).toUpperCase(),  // ISO 3166-1 alpha-2
  alpha3:         z.string().length(3).toUpperCase(),  // ISO 3166-1 alpha-3 (used by ZKPassport)
  name:           z.string(),                          // English name
  nativeName:     z.string(),                          // Name in national language
  language:       z.string().length(2),                // primary BCP-47 language
  languages:      z.array(z.string()),                 // all official languages
  rtl:            z.boolean(),
  identityScheme: z.string(),                          // e.g. "gov-verify", "aadhaar"
  flagEmoji:      z.string(),
  region:         z.enum(["africa","americas","asia","europe","middle-east","oceania"]),
  branding:       BrandingSchema,
  policies:       z.array(PolicySchema),
});

export type CountryConfig = z.infer<typeof CountryConfigSchema>;
export type PolicyConfig  = z.infer<typeof PolicySchema>;
export type Branding      = z.infer<typeof BrandingSchema>;
