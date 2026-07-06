/** Responsive hero min-heights — shorter on phones, taller on wide screens. */
export const HERO_HEIGHT = {
  home: 'min-h-[48vh] md:min-h-[72vh] lg:min-h-[85vh]',
  page: 'min-h-[42vh] md:min-h-[58vh] lg:min-h-[68vh]',
  compact: 'min-h-[36vh] md:min-h-[46vh] lg:min-h-[52vh]',
} as const;

/** Top padding clears the fixed header; less vertical padding on mobile. */
export const HERO_PADDING = 'pt-[92px] pb-12 px-[5vw] md:pt-[118px] md:pb-20 md:px-[6vw] lg:pt-[130px] lg:pb-[90px]';
