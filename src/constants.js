// ─────────────────────────────────────────────────────────────
// App constants — platforms, content types, hashtag libraries
// ─────────────────────────────────────────────────────────────

export const PLATFORMS = [
  { id: 'instagram', name: 'Instagram',       color: '#E1306C', icon: '📸', maxChars: 2200  },
  { id: 'facebook',  name: 'Facebook',        color: '#1877F2', icon: '👤', maxChars: 63206 },
  { id: 'twitter',   name: 'X / Twitter',     color: '#14171A', icon: '🐦', maxChars: 280   },
  { id: 'linkedin',  name: 'LinkedIn',        color: '#0A66C2', icon: '💼', maxChars: 3000  },
  { id: 'tiktok',    name: 'TikTok',          color: '#010101', icon: '🎵', maxChars: 2200  },
  { id: 'pinterest', name: 'Pinterest',       color: '#E60023', icon: '📌', maxChars: 500   },
  { id: 'youtube',   name: 'YouTube',         color: '#FF0000', icon: '▶️', maxChars: 5000  },
  { id: 'threads',   name: 'Threads',         color: '#1E1E1E', icon: '🧵', maxChars: 500   },
  { id: 'bluesky',   name: 'Bluesky',         color: '#0085FF', icon: '🦋', maxChars: 300   },
  { id: 'snapchat',  name: 'Snapchat',        color: '#FFFC00', icon: '👻', maxChars: 250   },
  { id: 'reddit',    name: 'Reddit',          color: '#FF4500', icon: '🔴', maxChars: 40000 },
  { id: 'gmb',       name: 'Google Business', color: '#4285F4', icon: '🗺', maxChars: 1500  },
];

export const POST_TYPES = ['Post', 'Story', 'Reel', 'Carousel', 'Video', 'Poll'];

export const HASHTAG_SETS = {
  fitness:    ['#fitness', '#workout', '#gym', '#health', '#fitlife', '#motivation'],
  food:       ['#foodie', '#recipe', '#cooking', '#homemade', '#yummy', '#chef'],
  business:   ['#entrepreneur', '#business', '#startup', '#hustle', '#success', '#branding'],
  travel:     ['#travel', '#wanderlust', '#explore', '#adventure', '#vacation', '#travelgram'],
  tech:       ['#tech', '#innovation', '#coding', '#AI', '#digital', '#future'],
  lifestyle:  ['#lifestyle', '#daily', '#vibes', '#aesthetic', '#inspo', '#mood'],
  realestate: ['#realestate', '#property', '#homesforsale', '#realtor', '#housing', '#investment'],
  beauty:     ['#beauty', '#skincare', '#makeup', '#selfcare', '#glowup', '#beautytips'],
};

export const BEST_TIMES = {
  instagram: [{ day: 'Tue', time: '11:00 AM' }, { day: 'Wed', time: '10:00 AM' }, { day: 'Fri', time: '2:00 PM'  }],
  facebook:  [{ day: 'Wed', time: '9:00 AM'  }, { day: 'Thu', time: '1:00 PM'  }, { day: 'Fri', time: '11:00 AM' }],
  twitter:   [{ day: 'Mon', time: '8:00 AM'  }, { day: 'Tue', time: '12:00 PM' }, { day: 'Thu', time: '5:00 PM'  }],
  linkedin:  [{ day: 'Tue', time: '10:00 AM' }, { day: 'Wed', time: '12:00 PM' }, { day: 'Thu', time: '9:00 AM'  }],
  tiktok:    [{ day: 'Tue', time: '7:00 PM'  }, { day: 'Thu', time: '8:00 PM'  }, { day: 'Sat', time: '10:00 AM' }],
  pinterest: [{ day: 'Fri', time: '3:00 PM'  }, { day: 'Sat', time: '8:00 PM'  }, { day: 'Sun', time: '12:00 PM' }],
};

export const CONTENT_CATEGORIES = [
  { id: 'promotional',  name: 'Promotional',       color: '#DC2626', icon: '🏷️' },
  { id: 'educational',  name: 'Educational',       color: '#2563EB', icon: '📚' },
  { id: 'entertaining', name: 'Entertaining',      color: '#D946EF', icon: '🎭' },
  { id: 'inspirational',name: 'Inspirational',     color: '#F59E0B', icon: '✨' },
  { id: 'behindscenes', name: 'Behind the Scenes', color: '#059669', icon: '🎬' },
  { id: 'ugc',          name: 'User Generated',    color: '#8B5CF6', icon: '👥' },
  { id: 'curated',      name: 'Curated',           color: '#0891B2', icon: '📰' },
];

// ─── COMPANIES ───────────────────────────────────────────────
export const DEMO_COMPANIES = [
  { id: '550e8400-e29b-41d4-a716-446655440000', name: 'Acme Marketing',  industry: 'Marketing Agency',    color: '#1D4ED8', initials: 'AM' },
  { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Green Leaf Co',   industry: 'Retail & eCommerce',  color: '#059669', initials: 'GL' },
  { id: '550e8400-e29b-41d4-a716-446655440002', name: 'Summit Media',    industry: 'Media & Publishing',  color: '#7C3AED', initials: 'SM' },
];

export const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });

export const fmt = (d) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const fmtTime = (d) =>
  new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
