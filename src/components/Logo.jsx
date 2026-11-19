const FILES = {
  full: { dark: '/brand/splitter-logo.png', white: '/brand/splitter-logo-white.png', width: 774, height: 160 },
  icon: { dark: '/brand/splitter-icon.png', white: '/brand/splitter-icon-white.png', width: 256, height: 256 },
};

// variant: 'full' | 'icon' | 'responsive' (icon only below 480px)
// onDark: use the white version on a genuinely dark surface
// decorative: use when text next to the logo already says "Splitter"
export default function Logo({ variant = 'full', onDark = false, decorative = false, className = '' }) {
  const tone = onDark ? 'white' : 'dark';
  const main = variant === 'icon' ? FILES.icon : FILES.full;
  const img = (
    <img
      src={main[tone]}
      alt={decorative ? '' : 'Splitter'}
      width={main.width}
      height={main.height}
      className={['logo', className].filter(Boolean).join(' ')}
    />
  );
  if (variant !== 'responsive') return img;
  return (
    <picture>
      <source media="(max-width: 479px)" srcSet={FILES.icon[tone]} width={FILES.icon.width} height={FILES.icon.height} />
      {img}
    </picture>
  );
}