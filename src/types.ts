// Shape of content/*.json — see README.md for the editing guide.

export type Lang = 'fr' | 'en';

export interface LocalizedText {
  fr?: string;
  en?: string;
}

export interface Fact {
  value: string;
  label: string;
}

export interface FeatureItem {
  title: string;
  body: string;
}

export interface RoomItem {
  title: string;
  body: string;
}

export interface Dict {
  lang?: string;
  brand?: string;
  meta?: { title?: string; description?: string };
  nav?: Record<string, string>;
  hero?: { title?: string; rating?: string; reviews?: string; host?: string; location?: string };
  facts?: { guests?: Fact; bedrooms?: Fact; beds?: Fact; baths?: Fact };
  gallery?: { showAll?: string; allTitle?: string; allCategory?: string; photoOf?: string };
  about?: { kicker?: string; subkicker?: string };
  features?: FeatureItem[];
  rooms?: { title?: string; items?: RoomItem[] };
  amenities?: { title?: string; items?: string[] };
  reviews?: {
    title?: string;
    overall?: string;
    basedOn?: string;
    guestFavorite?: string;
    tagsTitle?: string;
    tagsCount?: string;
    showAll?: string;
  };
  rules?: { title?: string; checkInTitle?: string; healthTitle?: string; cancelTitle?: string; cancelBody?: string };
  access?: { title?: string };
  loc?: { title?: string; mapLink?: string };
  book?: Record<string, string>;
  contact?: { title?: string; body?: string; cta?: string };
  footer?: { note?: string };
  lightbox?: { close?: string; prev?: string; next?: string };
  [key: string]: unknown;
}

export interface PhotoCategory extends LocalizedText {
  items: number[];
}

export interface SitePhotos {
  total: number;
  featured: number;
  hero: number[];
  categories: Record<string, PhotoCategory>;
}

export interface SiteMap {
  address?: string;
  center?: string;
  label?: string;
  googleQuery?: string;
  zoom?: number;
  bbox?: string;
  marker?: string;
}

export interface SiteConfig {
  siteUrl?: string;
  contact?: { phone?: string; phoneDisplay?: string; email?: string; whatsapp?: boolean };
  listings?: { airbnb?: string; booking?: string; google?: string };
  photos?: SitePhotos;
  address?: { street?: string; postalCode?: string; city?: string; region?: string; country?: string };
  map?: SiteMap;
  amenityIcons?: string[];
}

export interface ReviewCategoryScore extends LocalizedText {
  score: number;
}

export interface ReviewsSummary {
  rating?: string;
  count?: number;
  guestFavorite?: boolean;
  categories?: Record<string, ReviewCategoryScore>;
}

export interface ReviewTag extends LocalizedText {
  count: number;
}

export interface ReviewItem {
  author?: string;
  date?: string;
  rating?: number;
  text?: LocalizedText;
}

export interface ReviewsData {
  summary?: ReviewsSummary;
  tags?: ReviewTag[];
  items?: ReviewItem[];
}

export interface ProseContent {
  [slug: string]: string;
}

declare global {
  interface Window {
    __CONTENT__?: Record<string, unknown>;
  }
}
