import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight,
  BadgeCheck,
  Blocks,
  Cable,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  Check,
  CircuitBoard,
  Cloud,
  Code2,
  Cpu,
  Database,
  Factory,
  FileKey2,
  Gauge,
  GraduationCap,
  KeyRound,
  Layers3,
  LockKeyhole,
  Menu,
  Network,
  RadioTower,
  Rocket,
  ServerCog,
  ShieldCheck,
  TerminalSquare,
  Workflow,
  X,
} from 'lucide-react';
import './styles.css';

type BusinessLine = {
  title: string;
  eyebrow: string;
  description: string;
  icon: React.ComponentType<{ size?: number }>;
  points: string[];
  slug: string;
  detail: string;
};

type Solution = {
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number }>;
};

type ServiceShowcaseItem = {
  title: string;
  eyebrow: string;
  description: string;
  image: string;
};

const businessLines: BusinessLine[] = [
  {
    title: 'Industrial Automation',
    eyebrow: 'Controls and field systems',
    description:
      'The core of YVIMO: controls engineering, plant-floor systems, automation design, commissioning, and production support.',
    icon: Factory,
    points: ['PLC and HMI engineering', 'Machine integration', 'Commissioning and support'],
    slug: 'industrial-automation',
    detail:
      'Industrial Automation is the technical core of YVIMO. This division covers PLC and HMI engineering, machine integration, commissioning, troubleshooting, and automation support for production environments that need reliable execution on the plant floor.',
  },
  {
    title: 'Software Services',
    eyebrow: 'Apps, APIs, and data systems',
    description:
      'Custom software for manufacturers and teams that need useful dashboards, reliable APIs, and operational tools.',
    icon: Code2,
    points: ['Web applications', 'Backend APIs', 'Operational dashboards'],
    slug: 'software-services',
    detail:
      'Software Services turns industrial and business workflows into practical digital tools: web apps, APIs, dashboards, internal platforms, and data systems designed around how teams actually operate.',
  },
  {
    title: 'YVIMO Products',
    eyebrow: 'Physical and digital proprietary products',
    description:
      'Physical and digital products created by YVIMO to solve specific problems for industry, operations, and users.',
    icon: Blocks,
    points: ['YVIMO Gateway', 'Industrial tools', 'Digital platforms'],
    slug: 'yvimo-products',
    detail:
      'YVIMO Products is our proprietary product division for physical and digital tools. These products are created to solve specific industry problems, improve user workflows, and package repeatable solutions into scalable offerings.',
  },
  {
    title: 'YVIMO Academy',
    eyebrow: 'Online academy and professional guidance',
    description:
      'An online academy for learning industrial automation, staying current with industry demands, and receiving practical guidance.',
    icon: GraduationCap,
    points: ['Automation training', 'Mentoring and reviews', 'Industry updates'],
    slug: 'yvimo-academy',
    detail:
      'YVIMO Academy is our online learning division. It teaches industrial automation, provides mentoring, reviews work, guides learners through real industry expectations, and helps professionals stay current as technology changes.',
  },
];

const serviceShowcase: ServiceShowcaseItem[] = [
  {
    title: 'Controls',
    eyebrow: '01',
    description: 'PLC, HMI, SCADA, commissioning, troubleshooting, and plant-floor integration.',
    image: '/assets/services/robot-cell-closeup.jpeg',
  },
  {
    title: 'Software',
    eyebrow: '02',
    description: 'Modern web applications, backend APIs, dashboards, data workflows, and internal platforms.',
    image: '/assets/services/software-systems.svg',
  },
  {
    title: 'Products',
    eyebrow: '03',
    description: 'YVIMO Gateway, account services, licensing, and tools for connected operations.',
    image: '/assets/services/yvimo-products.svg',
  },
  {
    title: 'Virtual Commissioning',
    eyebrow: '04',
    description: 'Digital manufacturing cells, robot simulations, layout validation, and offline verification.',
    image: '/assets/services/tx-process-simulate-3.webp',
  },
  {
    title: 'Industrial Engineering',
    eyebrow: '05',
    description: 'Process optimization, cycle-time analysis, material flow, bottleneck studies, and improvement roadmaps.',
    image: '/assets/services/process-manufacturing.jpg',
  },
  {
    title: 'Manufacturing',
    eyebrow: '06',
    description: 'Production systems, robotic cells, fixtures, line support, and launch-ready execution.',
    image: '/assets/services/robot-cell-floor.jpeg',
  },
  {
    title: 'IT/OT Integration',
    eyebrow: '07',
    description: 'Connect PLCs, edge devices, APIs, databases, MQTT, cloud services, and reporting layers.',
    image: '/assets/services/efs1.png',
  },
  {
    title: 'Digital Manufacturing',
    eyebrow: '08',
    description: 'Tecnomatix, DELMIA, simulation models, line studies, and connected engineering workflows.',
    image: '/assets/services/autotech-tecnomatix-11.webp',
  },
];

const solutions: Solution[] = [
  {
    title: 'PLC to API',
    description: 'Expose live PLC tags through clean REST and WebSocket interfaces.',
    icon: Cable,
  },
  {
    title: 'Production Dashboards',
    description: 'Turn machine and process data into screens teams can actually use.',
    icon: ChartNoAxesCombined,
  },
  {
    title: 'Cloud and Edge',
    description: 'Route selected data to databases, MQTT, cloud systems, and reports.',
    icon: Cloud,
  },
  {
    title: 'Secure Licensing',
    description: 'Prepare commercial apps with accounts, API keys, entitlements, and license checks.',
    icon: FileKey2,
  },
];

const gatewayFeatures = [
  'Siemens S7 first, expandable driver model',
  'Tag catalog, import workflow, and route builder',
  'REST API, WebSocket path, and future MQTT outputs',
  'Designed for local edge deployments and modern software stacks',
];

const repeatedServiceShowcase = [
  ...serviceShowcase,
  ...serviceShowcase,
  ...serviceShowcase,
];

function ServicesShowcase() {
  const serviceCount = serviceShowcase.length;
  const [servicePosition, setServicePosition] = React.useState(serviceCount);
  const [isPaused, setIsPaused] = React.useState(false);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const servicePositionRef = React.useRef(serviceCount);
  const resetTimeoutRef = React.useRef<number | null>(null);
  const scrollTimeoutRef = React.useRef<number | null>(null);

  const activeIndex =
    ((servicePosition % serviceCount) + serviceCount) % serviceCount;

  React.useEffect(() => {
    servicePositionRef.current = servicePosition;
  }, [servicePosition]);

  const scrollToPosition = React.useCallback((
    position: number,
    behavior: ScrollBehavior = 'smooth',
  ) => {
    const track = trackRef.current;
    const card = trackRef.current?.querySelector<HTMLElement>(
      `[data-service-position="${position}"]`,
    );

    if (!track || !card) return;

    const targetLeft =
      card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2;

    setServicePosition(position);
    track.scrollTo({ left: targetLeft, behavior });
  }, []);

  const normalizePosition = React.useCallback((position: number) => {
    if (resetTimeoutRef.current !== null) {
      window.clearTimeout(resetTimeoutRef.current);
    }

    const normalizedIndex =
      ((position % serviceCount) + serviceCount) % serviceCount;
    const middlePosition = serviceCount + normalizedIndex;

    if (position >= serviceCount && position < serviceCount * 2) return;

    resetTimeoutRef.current = window.setTimeout(() => {
      scrollToPosition(middlePosition, 'auto');
    }, 520);
  }, [scrollToPosition, serviceCount]);

  const moveToPosition = React.useCallback((position: number) => {
    scrollToPosition(position);
    normalizePosition(position);
  }, [normalizePosition, scrollToPosition]);

  const moveToIndex = React.useCallback((index: number) => {
    moveToPosition(serviceCount + index);
  }, [moveToPosition, serviceCount]);

  React.useEffect(() => {
    if (isPaused) return;

    const interval = window.setInterval(() => {
      moveToPosition(servicePosition + 1);
    }, 4200);

    return () => window.clearInterval(interval);
  }, [isPaused, moveToPosition, servicePosition]);

  React.useEffect(() => {
    scrollToPosition(serviceCount, 'auto');

    const handleResize = () => {
      scrollToPosition(servicePositionRef.current, 'auto');
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current);
      }
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [scrollToPosition, serviceCount]);

  const handleTrackScroll = () => {
    const track = trackRef.current;
    if (!track) return;

    if (scrollTimeoutRef.current !== null) {
      window.clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = window.setTimeout(() => {
      const cards = Array.from(
        track.querySelectorAll<HTMLElement>('[data-service-position]'),
      );
      const trackCenter = track.scrollLeft + track.clientWidth / 2;
      const nearestCard = cards.reduce<HTMLElement | null>((nearest, card) => {
        if (nearest === null) return card;

        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const nearestCenter = nearest.offsetLeft + nearest.offsetWidth / 2;

        return Math.abs(cardCenter - trackCenter) <
          Math.abs(nearestCenter - trackCenter)
          ? card
          : nearest;
      }, null);
      const nearestPosition = Number(
        nearestCard?.dataset.servicePosition ?? serviceCount,
      );

      if (Number.isNaN(nearestPosition)) return;

      setServicePosition(nearestPosition);
      normalizePosition(nearestPosition);
    }, 140);
  };

  return (
    <section className="services-showcase" id="services">
      <div className="services-heading">
        <p className="eyebrow">Our services</p>
        <h2>Services for connected manufacturing.</h2>
        <p>
          From controls and software to virtual commissioning, process
          optimization, manufacturing, and IT/OT integration.
        </p>
      </div>

      <div
        className="services-carousel"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocus={() => setIsPaused(true)}
        onBlur={() => setIsPaused(false)}
      >
        <button
          className="service-nav service-nav-left"
          type="button"
          aria-label="Previous service"
          onClick={() => moveToPosition(servicePosition - 1)}
        >
          <ChevronLeft size={24} />
        </button>
        <div className="services-track" ref={trackRef} onScroll={handleTrackScroll}>
          {repeatedServiceShowcase.map((service, index) => (
            <article
              className={
                index % serviceCount === activeIndex
                  ? 'service-panel active'
                  : 'service-panel'
              }
              data-service-position={index}
              key={`${service.title}-${index}`}
              onClick={() => moveToPosition(index)}
            >
              <img src={service.image} alt="" aria-hidden="true" />
              <div className="service-panel-shade" />
              <div className="service-panel-copy">
                <span>{service.eyebrow}</span>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
              </div>
            </article>
          ))}
        </div>
        <button
          className="service-nav service-nav-right"
          type="button"
          aria-label="Next service"
          onClick={() => moveToPosition(servicePosition + 1)}
        >
          <ChevronRight size={24} />
        </button>
      </div>

      <div className="service-dots" aria-label="Service carousel position">
        {serviceShowcase.map((service, index) => (
          <button
            className={index === activeIndex ? 'active' : ''}
            type="button"
            key={service.title}
            aria-label={`Show ${service.title}`}
            onClick={() => moveToIndex(index)}
          />
        ))}
      </div>
    </section>
  );
}

function BusinessLinePage({
  line,
  onNavigateHome,
}: {
  line: BusinessLine;
  onNavigateHome: (hash?: string) => void;
}) {
  const Icon = line.icon;

  return (
    <main>
      <section className="business-detail-page">
        <button
          className="business-back-link"
          type="button"
          onClick={() => onNavigateHome('#lines')}
        >
          <ArrowRight size={17} />
          Back to business lines
        </button>
        <div className="business-detail-layout">
          <div className="business-detail-copy">
            <p className="eyebrow">{line.eyebrow}</p>
            <h1>{line.title}</h1>
            <p>{line.detail}</p>
          </div>
          <div className="business-detail-card">
            <div className="card-icon"><Icon size={28} /></div>
            <h2>What this division covers</h2>
            <ul>
              {line.points.map((point) => (
                <li key={point}><Check size={17} /> {point}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}

function App() {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [scrollProgress, setScrollProgress] = React.useState(0);
  const [currentPath, setCurrentPath] = React.useState(() =>
    typeof window === 'undefined' ? '/' : window.location.pathname,
  );
  const [viewportWidth, setViewportWidth] = React.useState(() =>
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  );

  const closeMenu = () => setMenuOpen(false);
  const compactViewport = viewportWidth < 760;
  const tinyViewport = viewportWidth < 480;
  const expandedHeaderHeight = compactViewport ? 104 : 128;
  const compactHeaderHeight = compactViewport ? 82 : 94;
  const expandedWaveDepth = compactViewport ? 34 : 48;
  const expandedBrandWidth = tinyViewport ? 82 : compactViewport ? 330 : viewportWidth < 1040 ? 372 : 420;
  const headerHeight =
    expandedHeaderHeight - scrollProgress * (expandedHeaderHeight - compactHeaderHeight);
  const waveDepth = expandedWaveDepth * (1 - scrollProgress);
  const startBrandCenter = tinyViewport
    ? Math.min(Math.max(viewportWidth * 0.22, 86), 114)
    : compactViewport
      ? Math.min(Math.max(viewportWidth * 0.28, 190), 254)
      : Math.min(Math.max(viewportWidth * 0.2, 305), 370);
  const brandLeft =
    startBrandCenter + (viewportWidth / 2 - startBrandCenter) * scrollProgress;
  const expandedBrandTop = expandedHeaderHeight / 2 + expandedWaveDepth * 0.34;
  const brandTop =
    expandedBrandTop + (headerHeight / 2 - expandedBrandTop) * scrollProgress;
  const expandedNavTop = expandedHeaderHeight / 2 + expandedWaveDepth * 0.42;
  const navTop = expandedNavTop + (headerHeight / 2 - expandedNavTop) * scrollProgress;
  const expandedNavRight = Math.max(viewportWidth * 0.22, 300);
  const compactNavRight = Math.min(Math.max(viewportWidth * 0.04, 18), 54);
  const navRight =
    expandedNavRight + (compactNavRight - expandedNavRight) * scrollProgress;
  const expandedSloganCenter = viewportWidth * 0.84;
  const sloganLeft =
    expandedSloganCenter + (viewportWidth - compactNavRight - 260 - expandedSloganCenter) * scrollProgress;
  const expandedMenuLeft = Math.min(
    expandedSloganCenter + Math.min(230, viewportWidth * 0.15) + 34,
    viewportWidth - 160,
  );
  const compactMenuLeft = viewportWidth - compactNavRight - 62;
  const expandedMenuLeftPosition =
    expandedMenuLeft + (compactMenuLeft - expandedMenuLeft) * scrollProgress;
  const expandedMenuPanelLeft = Math.min(
    expandedMenuLeftPosition,
    viewportWidth - 220 - compactNavRight,
  );
  const navScale = 1.08 - scrollProgress * 0.08;
  const navRevealProgress = Math.min(Math.max((scrollProgress - 0.34) / 0.42, 0), 1);
  const sloganProgress = 1 - Math.min(Math.max(scrollProgress / 0.42, 0), 1);
  const expandedMenuProgress = Math.max(sloganProgress, 0);
  const expandedMenuActive = expandedMenuProgress > 0.08;
  const brandScale = 1 - scrollProgress * 0.46;
  const logoRotation = scrollProgress * 360;
  const edgeStraightProgress = Math.min(Math.max((scrollProgress - 0.82) / 0.18, 0), 1);
  const edgeShape = 1 - scrollProgress;
  const selectedBusinessLine = businessLines.find((line) => {
    return currentPath === `/business/${line.slug}`;
  });
  const orangeEdgePath =
    `M0 0 C80 ${62 * edgeShape} 210 ${80 * edgeShape} 360 ${56 * edgeShape} ` +
    `C500 ${34 * edgeShape} 570 0 710 0 ` +
    `C850 0 930 ${46 * edgeShape} 1080 ${76 * edgeShape} ` +
    `C1225 ${105 * edgeShape} 1410 ${84 * edgeShape} 1600 ${28 * edgeShape}`;

  React.useEffect(() => {
    let frame = 0;

    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const progress = Math.min(window.scrollY / 260, 1);
        setScrollProgress(progress);
        setViewportWidth(window.innerWidth);
      });
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  React.useEffect(() => {
    const updatePath = () => setCurrentPath(window.location.pathname);

    window.addEventListener('popstate', updatePath);
    return () => window.removeEventListener('popstate', updatePath);
  }, []);

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(window.location.pathname);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    closeMenu();
  };

  const navigateHome = (hash = '') => {
    window.history.pushState({}, '', `/${hash}`);
    setCurrentPath('/');
    window.setTimeout(() => {
      if (!hash) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' });
    }, 0);
    closeMenu();
  };

  return (
    <div
      className="site-shell"
      style={
        {
          '--header-height': `${headerHeight}px`,
          '--wave-depth': `${waveDepth}px`,
          '--brand-left': `${brandLeft}px`,
          '--brand-top': `${brandTop}px`,
          '--nav-top': `${navTop}px`,
          '--nav-right': `${navRight}px`,
          '--expanded-menu-left': `${expandedMenuLeftPosition}px`,
          '--expanded-menu-panel-left': `${expandedMenuPanelLeft}px`,
          '--slogan-left': `${sloganLeft}px`,
          '--nav-scale': navScale,
          '--nav-reveal-progress': navRevealProgress,
          '--slogan-progress': sloganProgress,
          '--expanded-menu-progress': expandedMenuProgress,
          '--brand-scale': brandScale,
          '--logo-rotation': `${logoRotation}deg`,
          '--scroll-progress': scrollProgress,
          '--edge-straight-progress': edgeStraightProgress,
        } as React.CSSProperties
      }
    >
      <header className="topbar">
        <a
          className="brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            navigateHome();
          }}
          aria-label="YVIMO home"
        >
          <img
            className="brand-logo brand-logo-square"
            src="/assets/logos/yvimo-square-logo-2024.png"
            alt=""
            aria-hidden="true"
          />
          <span className="brand-letters-wrap">
            <img
              className="brand-logo brand-logo-letters"
              src="/assets/logos/yvimo-logo-letters-holding.png"
          alt="YVIMO"
            />
          </span>
        </a>
        <div className="header-slogan" aria-hidden="true">
          <span>Engineering Automation</span>
          <span>
            that <strong>delivers results</strong>
          </span>
        </div>
        <button
          className={expandedMenuActive ? 'expanded-menu-button active' : 'expanded-menu-button'}
          type="button"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        <button
          className="icon-button menu-button"
          type="button"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          onClick={() => setMenuOpen((value) => !value)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div
          className={
            menuOpen && expandedMenuActive
              ? 'expanded-menu-panel open'
              : 'expanded-menu-panel'
          }
        >
          <a href="/#services" onClick={(event) => { event.preventDefault(); navigateHome('#services'); }}>Services</a>
          <a href="/#gateway" onClick={(event) => { event.preventDefault(); navigateHome('#gateway'); }}>Gateway</a>
          <a href="/#solutions" onClick={(event) => { event.preventDefault(); navigateHome('#solutions'); }}>Solutions</a>
          <a href="/#platform" onClick={(event) => { event.preventDefault(); navigateHome('#platform'); }}>Platform</a>
          <a className="panel-cta" href="/#contact" onClick={(event) => { event.preventDefault(); navigateHome('#contact'); }}>Start a project</a>
        </div>
        <nav className={menuOpen ? 'nav-links open' : 'nav-links'} aria-label="Primary navigation">
          <a href="/#services" onClick={(event) => { event.preventDefault(); navigateHome('#services'); }}>Services</a>
          <a href="/#gateway" onClick={(event) => { event.preventDefault(); navigateHome('#gateway'); }}>Gateway</a>
          <a href="/#solutions" onClick={(event) => { event.preventDefault(); navigateHome('#solutions'); }}>Solutions</a>
          <a href="/#platform" onClick={(event) => { event.preventDefault(); navigateHome('#platform'); }}>Platform</a>
          <a className="nav-cta" href="/#contact" onClick={(event) => { event.preventDefault(); navigateHome('#contact'); }}>Start a project</a>
        </nav>
        <svg
          className="header-wave"
          viewBox="0 0 1600 120"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M0 0 C80 62 210 80 360 56 C500 34 570 0 710 0 C850 0 930 46 1080 76 C1225 105 1410 84 1600 28 L1600 0 Z" />
        </svg>
        <div className="header-orange-edge" aria-hidden="true">
          <svg viewBox="0 0 1600 120" preserveAspectRatio="none" focusable="false">
            <path d={orangeEdgePath} />
          </svg>
        </div>
      </header>

      {selectedBusinessLine ? (
        <BusinessLinePage
          line={selectedBusinessLine}
          onNavigateHome={navigateHome}
        />
      ) : (
      <main>
        <section className="hero-section" id="home">
          <div className="hero-visual" aria-hidden="true">
            <div className="grid-layer" />
            <div className="signal-line line-a" />
            <div className="signal-line line-b" />
            <div className="signal-line line-c" />
            <img
              className="industrial-robot-layer robot-layer-left"
              src="/assets/hero/robot-left.png"
              alt=""
              aria-hidden="true"
            />
            <img
              className="industrial-robot-layer robot-layer-right"
              src="/assets/hero/robot-right.png"
              alt=""
              aria-hidden="true"
            />
            <div className="hero-console">
              <div className="console-header">
                <span className="status-dot" />
                <span>YVIMO Operations Fabric</span>
                <strong>LIVE</strong>
              </div>
              <div className="console-body">
                <div className="metric-panel">
                  <Gauge size={22} />
                  <span>Gateway Health</span>
                  <strong>98.7%</strong>
                </div>
                <div className="metric-panel">
                  <RadioTower size={22} />
                  <span>PLC Routes</span>
                  <strong>24</strong>
                </div>
                <div className="route-map">
                  <span className="node source"><Cpu size={18} /> PLC</span>
                  <span className="route-connector" />
                  <span className="node core"><ServerCog size={18} /> Gateway</span>
                  <span className="route-connector" />
                  <span className="node output"><Database size={18} /> API</span>
                </div>
              </div>
            </div>
          </div>
          <div className="hero-copy">
            <p className="eyebrow">Industrial automation, software services, and connected products</p>
            <h1>Automation systems built beyond the machine.</h1>
            <p className="hero-lede">
              We build control systems, industrial software, and connected products that help manufacturers modernize machines, move data reliably, and turn operations into scalable digital systems.
            </p>
            <div className="hero-actions">
              <a className="primary-action" href="#contact">
                Start a project <ArrowRight size={18} />
              </a>
              <a className="secondary-action" href="#gateway">Explore our solutions</a>
            </div>
          </div>
        </section>

        <ServicesShowcase />

        <section className="section" id="lines">
          <div className="section-heading business-heading">
            <p className="eyebrow">Business lines</p>
            <h2>The four divisions that move YVIMO forward.</h2>
            <p>
              Industrial automation remains our core. Around it, YVIMO grows through software services, proprietary products, and YVIMO Academy: our learning space for the next generation of industrial talent.
            </p>
          </div>
          <div className="business-grid">
            {businessLines.map((line) => {
              const Icon = line.icon;
              return (
                <a
                  className="business-card"
                  href={`/business/${line.slug}`}
                  key={line.title}
                  onClick={(event) => {
                    event.preventDefault();
                    navigateTo(`/business/${line.slug}`);
                  }}
                >
                  <div className="card-icon"><Icon size={24} /></div>
                  <p className="eyebrow">{line.eyebrow}</p>
                  <h3>{line.title}</h3>
                  <p>{line.description}</p>
                  <ul>
                    {line.points.map((point) => (
                      <li key={point}><Check size={16} /> {point}</li>
                    ))}
                  </ul>
                </a>
              );
            })}
          </div>
        </section>

        <section className="product-section" id="gateway">
          <div className="product-copy">
            <p className="eyebrow">Featured product</p>
            <h2>YVIMO Gateway</h2>
            <p>
              A lightweight industrial data gateway for connecting PLCs and edge devices to APIs, dashboards, databases, cloud systems, and custom software.
            </p>
            <div className="feature-list">
              {gatewayFeatures.map((feature) => (
                <span key={feature}><BadgeCheck size={17} /> {feature}</span>
              ))}
            </div>
            <a className="text-link" href="#contact">Talk about a Gateway deployment <ArrowRight size={17} /></a>
          </div>
          <div className="gateway-panel" aria-label="YVIMO Gateway preview">
            <div className="panel-toolbar">
              <span>Gateway dashboard</span>
              <strong>Edge node: Line 04</strong>
            </div>
            <div className="dashboard-grid">
              <div className="dash-card tall">
                <Network size={22} />
                <span>Routes</span>
                <strong>{'Connect -> Process -> Output'}</strong>
                <div className="mini-flow">
                  <i />
                  <b />
                  <i />
                  <b />
                  <i />
                </div>
              </div>
              <div className="dash-card">
                <TerminalSquare size={22} />
                <span>API</span>
                <strong>/tags/live</strong>
              </div>
              <div className="dash-card">
                <ShieldCheck size={22} />
                <span>Status</span>
                <strong>Running</strong>
              </div>
              <div className="dash-card wide">
                <Workflow size={22} />
                <span>Destinations</span>
                <strong>Database, MQTT, Webhook, Reports</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="solutions">
          <div className="section-heading compact">
            <p className="eyebrow">Solutions</p>
            <h2>Built around real operations.</h2>
          </div>
          <div className="solution-grid">
            {solutions.map((solution) => {
              const Icon = solution.icon;
              return (
                <article className="solution-card" key={solution.title}>
                  <Icon size={24} />
                  <h3>{solution.title}</h3>
                  <p>{solution.description}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="platform-section" id="platform">
          <div className="platform-content">
            <p className="eyebrow">Platform foundation</p>
            <h2>Ready for accounts, APIs, and licensing.</h2>
            <p>
              This new website is also the front door for the future YVIMO platform: user accounts, API keys, product access, license validation, customer portals, and developer-facing services.
            </p>
          </div>
          <div className="platform-steps">
            <div><KeyRound size={20} /><span>Accounts</span></div>
            <div><LockKeyhole size={20} /><span>Licenses</span></div>
            <div><Layers3 size={20} /><span>APIs</span></div>
            <div><Rocket size={20} /><span>Apps</span></div>
          </div>
        </section>

        <section className="contact-section" id="contact">
          <div>
            <p className="eyebrow">Start here</p>
            <h2>Tell us what you want to connect, automate, or build.</h2>
            <p>
              Use this first version as the base. Next we can connect real forms, case studies, account flows, product pages, and the GitHub deployment pipeline.
            </p>
          </div>
          <a className="primary-action" href="mailto:info@yvimo.com">
            Contact YVIMO <ArrowRight size={18} />
          </a>
        </section>
      </main>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
