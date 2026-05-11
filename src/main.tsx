import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight,
  BadgeCheck,
  Blocks,
  Cable,
  ChartNoAxesCombined,
  Check,
  CircuitBoard,
  Cloud,
  Code2,
  Cpu,
  Database,
  Factory,
  FileKey2,
  Gauge,
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
};

type Solution = {
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number }>;
};

const businessLines: BusinessLine[] = [
  {
    title: 'Industrial Automation',
    eyebrow: 'Controls and field systems',
    description:
      'PLC programming, HMI/SCADA, electrical integration, commissioning, and support for production environments.',
    icon: Factory,
    points: ['PLC and HMI engineering', 'Machine integration', 'Controls troubleshooting'],
  },
  {
    title: 'Software Services',
    eyebrow: 'Apps, APIs, and data systems',
    description:
      'Custom web apps, operational dashboards, backend APIs, and internal tools built around real business workflows.',
    icon: Code2,
    points: ['Web applications', 'API development', 'Operational dashboards'],
  },
  {
    title: 'YVIMO Products',
    eyebrow: 'Gateway, apps, and platform services',
    description:
      'A growing product line for industrial data, account services, license management, and connected operations.',
    icon: Blocks,
    points: ['YVIMO Gateway', 'Account platform', 'License server roadmap'],
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

function App() {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [scrollProgress, setScrollProgress] = React.useState(0);
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
  const navScale = 1.08 - scrollProgress * 0.08;
  const navRevealProgress = Math.min(Math.max((scrollProgress - 0.34) / 0.42, 0), 1);
  const sloganProgress = 1 - Math.min(Math.max(scrollProgress / 0.42, 0), 1);
  const expandedMenuProgress = Math.max(sloganProgress, 0);
  const expandedMenuActive = expandedMenuProgress > 0.08;
  const brandScale = 1 - scrollProgress * 0.46;
  const logoRotation = scrollProgress * 360;
  const edgeStraightProgress = Math.min(Math.max((scrollProgress - 0.82) / 0.18, 0), 1);
  const edgeShape = 1 - scrollProgress;
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
        <a className="brand" href="#home" onClick={closeMenu} aria-label="YVIMO home">
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
          <a href="#lines" onClick={closeMenu}>Business lines</a>
          <a href="#gateway" onClick={closeMenu}>Gateway</a>
          <a href="#solutions" onClick={closeMenu}>Solutions</a>
          <a href="#platform" onClick={closeMenu}>Platform</a>
          <a className="panel-cta" href="#contact" onClick={closeMenu}>Start a project</a>
        </div>
        <nav className={menuOpen ? 'nav-links open' : 'nav-links'} aria-label="Primary navigation">
          <a href="#lines" onClick={closeMenu}>Business lines</a>
          <a href="#gateway" onClick={closeMenu}>Gateway</a>
          <a href="#solutions" onClick={closeMenu}>Solutions</a>
          <a href="#platform" onClick={closeMenu}>Platform</a>
          <a className="nav-cta" href="#contact" onClick={closeMenu}>Start a project</a>
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

      <main>
        <section className="hero-section" id="home">
          <div className="hero-visual" aria-hidden="true">
            <div className="grid-layer" />
            <div className="signal-line line-a" />
            <div className="signal-line line-b" />
            <div className="signal-line line-c" />
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
            <h1>YVIMO builds the bridge between machines, data, and modern software.</h1>
            <p className="hero-lede">
              We design controls systems, build custom apps and APIs, and develop YVIMO products like Gateway for teams that need industrial reliability with software speed.
            </p>
            <div className="hero-actions">
              <a className="primary-action" href="#contact">
                Start a project <ArrowRight size={18} />
              </a>
              <a className="secondary-action" href="#gateway">Explore Gateway</a>
            </div>
          </div>
        </section>

        <section className="section intro-strip" aria-label="YVIMO focus">
          <div>
            <span>01</span>
            <strong>Controls</strong>
            <p>PLC, HMI, SCADA, commissioning, and plant-floor integration.</p>
          </div>
          <div>
            <span>02</span>
            <strong>Software</strong>
            <p>Modern web applications, backend APIs, data workflows, and internal platforms.</p>
          </div>
          <div>
            <span>03</span>
            <strong>Products</strong>
            <p>Gateway, account services, licensing, and tools for connected operations.</p>
          </div>
        </section>

        <section className="section" id="lines">
          <div className="section-heading">
            <p className="eyebrow">What YVIMO is becoming</p>
            <h2>One company, three connected lines of work.</h2>
            <p>
              The automation work remains core, but the web now reflects the larger direction: industrial systems, software services, and proprietary products that can share accounts, APIs, and licensing.
            </p>
          </div>
          <div className="business-grid">
            {businessLines.map((line) => {
              const Icon = line.icon;
              return (
                <article className="business-card" key={line.title}>
                  <div className="card-icon"><Icon size={24} /></div>
                  <p className="eyebrow">{line.eyebrow}</p>
                  <h3>{line.title}</h3>
                  <p>{line.description}</p>
                  <ul>
                    {line.points.map((point) => (
                      <li key={point}><Check size={16} /> {point}</li>
                    ))}
                  </ul>
                </article>
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
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
