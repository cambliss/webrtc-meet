import Link from "next/link";
import { cookies } from "next/headers";
import Image from "next/image";

import { JoinMeetingForm } from "@/src/components/JoinMeetingForm";
import { verifyAuthToken } from "@/src/lib/auth";

export default async function HomePage() {
  const token = (await cookies()).get("meeting_token")?.value;
  const auth = token ? verifyAuthToken(token) : null;
  const year = new Date().getFullYear();

  return (
    <main className="lp-shell">
      <div className="lp-announcement">2026 release: AI summaries, branded workspaces, and enterprise controls.</div>

      <header className="lp-header">
        <nav className="lp-nav">
          <div className="lp-nav-left">
            <Link href="/" className="lp-nav-logo">
              <Image
                src="/logo.png"
                alt="Brand logo"
                width={64}
                height={64}
                className="lp-logo-image"
                priority
              />
            </Link>
            <div className="lp-nav-links">
              <a href="#features">Features</a>
              <a href="#solutions">Solutions</a>
              <a href="#pricing">Pricing</a>
              <a href="#faq">FAQ</a>
            </div>
          </div>
          <div className="lp-nav-right">
            <Link href="/login" className="lp-btn-outline">
              Sign in
            </Link>
            <a href="#start" className="lp-btn-primary">
              Start free
            </a>
          </div>
        </nav>
      </header>

      <section className="lp-hero">
        <div className="lp-container lp-hero-stage">
          <div className="lp-glow lp-glow-blue" aria-hidden="true" />
          <div className="lp-glow lp-glow-green" aria-hidden="true" />
          <div className="lp-glow lp-glow-red" aria-hidden="true" />

          <p className="lp-hero-eyebrow">Premium video collaboration</p>
          <h1 className="lp-hero-title-3d">
            Every meeting should feel <span>clear, secure, and productive</span>
          </h1>
          <p className="lp-hero-sub">
            Bring calls, chat, transcripts, recordings, and AI insights into one polished workspace
            experience for modern teams.
          </p>
          <div className="lp-hero-cta">
            <a href="#start" className="lp-btn-hero-primary">
              Launch your room
            </a>
            <Link href="/meeting-history" className="lp-btn-hero-outline">
              Explore analytics
            </Link>
          </div>

          <div className="lp-hero-image-wrap">
            <div className="lp-floating-pill lp-pill-blue" aria-hidden="true">1080p HD</div>
            <div className="lp-floating-pill lp-pill-green" aria-hidden="true">AI Notes</div>
            <div className="lp-floating-pill lp-pill-red" aria-hidden="true">Secure Access</div>

            <div className="lp-hero-mockup">
              <div className="lp-mockup-bar">
                <span className="lp-mockup-dot lp-r" />
                <span className="lp-mockup-dot lp-y" />
                <span className="lp-mockup-dot lp-g" />
                <div className="lp-mockup-url">https://officeconnect.app/meeting/exec-sync</div>
              </div>
              <div className="lp-mockup-body">
                <aside className="lp-mockup-sidebar">
                  <div className="lp-sidebar-btn">+ New room</div>
                  <div className="lp-sidebar-item lp-active">Live meetings</div>
                  <div className="lp-sidebar-item">Meeting history</div>
                  <div className="lp-sidebar-item">Team analytics</div>
                  <div className="lp-sidebar-item">Workspace settings</div>
                </aside>

                <div className="lp-mockup-main">
                  <h3>Today on your workspace</h3>
                  <div className="lp-file-grid">
                    <article className="lp-file-card">
                      <div className="lp-file-thumb lp-blue">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7 16 12 23 17z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                      </div>
                      <div className="lp-file-info">
                        <p>Leadership Sync</p>
                        <span>12 participants</span>
                      </div>
                    </article>
                    <article className="lp-file-card">
                      <div className="lp-file-thumb lp-green">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg>
                      </div>
                      <div className="lp-file-info">
                        <p>Roadmap Review</p>
                        <span>Summary generated</span>
                      </div>
                    </article>
                    <article className="lp-file-card">
                      <div className="lp-file-thumb lp-red">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#67e8f9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      </div>
                      <div className="lp-file-info">
                        <p>Customer Call</p>
                        <span>Transcript synced</span>
                      </div>
                    </article>
                    <article className="lp-file-card">
                      <div className="lp-file-thumb lp-yellow">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
                      </div>
                      <div className="lp-file-info">
                        <p>Q1 Metrics</p>
                        <span>Recording archived</span>
                      </div>
                    </article>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-logo-bar">
        <div className="lp-container">
          <p>Trusted by fast-moving teams and global organizations</p>
          <div className="lp-logos">
            <span className="lp-logo-item">Northstar</span>
            <span className="lp-logo-item">Vertex<span>Labs</span></span>
            <span className="lp-logo-item">Brightline</span>
            <span className="lp-logo-item">Acme<span>Cloud</span></span>
            <span className="lp-logo-item">Helio</span>
          </div>
        </div>
      </section>

      <section id="features" className="lp-section">
        <div className="lp-container">
          <div className="lp-features-intro">
            <p className="lp-section-label">Features</p>
            <h2 className="lp-section-title">Designed for premium meeting experiences</h2>
            <p className="lp-section-sub">
              This platform combines live collaboration with practical automation so teams spend less
              time managing calls and more time moving work forward.
            </p>
          </div>

          <div className="lp-features-grid">
            <article className="lp-feature-card">
              <div className="lp-feature-icon lp-blue">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <h3>Instant meeting joins</h3>
              <p>Fast WebRTC connections with optimized media paths and low-latency signaling.</p>
            </article>
            <article className="lp-feature-card">
              <div className="lp-feature-icon lp-green">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              </div>
              <h3>Live transcripts</h3>
              <p>Auto-generated transcripts keep meetings searchable and easy to review later.</p>
            </article>
            <article className="lp-feature-card">
              <div className="lp-feature-icon lp-red">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#67e8f9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </div>
              <h3>AI action summaries</h3>
              <p>Turn discussions into concise decisions, owners, and next steps after each call.</p>
            </article>
            <article className="lp-feature-card">
              <div className="lp-feature-icon lp-yellow">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <h3>Enterprise security</h3>
              <p>Workspace RBAC, auth controls, and audit-ready logs for confident operations.</p>
            </article>
          </div>
        </div>
      </section>

      <section id="solutions" className="lp-strip">
        <div className="lp-container">
          <div className="lp-features-intro">
            <p className="lp-section-label">Solutions</p>
            <h2 className="lp-section-title">Purpose-built for every team workflow</h2>
          </div>

          <div className="lp-solutions-grid">
            <article className="lp-solution-card">
              <h3>Sales & client success</h3>
              <p>Run polished demos and reviews with call recordings, highlights, and follow-up summaries.</p>
              <ul>
                <li>Meeting highlights</li>
                <li>Shareable recordings</li>
                <li>Post-call AI recap</li>
              </ul>
            </article>
            <article className="lp-solution-card">
              <h3>Operations & leadership</h3>
              <p>Coordinate distributed teams with reliable standups and measurable meeting outcomes.</p>
              <ul>
                <li>Attendance tracking</li>
                <li>Workspace analytics</li>
                <li>Role-based controls</li>
              </ul>
            </article>
            <article className="lp-solution-card">
              <h3>Support & onboarding</h3>
              <p>Deliver guided sessions with searchable transcripts and conversation playback.</p>
              <ul>
                <li>Transcript search</li>
                <li>Replay timeline</li>
                <li>Knowledge-ready notes</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-container lp-split">
          <div className="lp-split-text">
            <p className="lp-section-label">Platform</p>
            <h2>Everything in one branded workspace</h2>
            <p>
              Manage meetings, people, and permissions in a single place. It adapts from
              startup teams to enterprise operations without changing your workflow.
            </p>
            <Link href="/workspaces" className="lp-link">Open workspace management</Link>
          </div>

          <div className="lp-stat-panel">
            <div className="lp-stat-item">
              <h3>99.95%</h3>
              <p>service uptime target</p>
            </div>
            <div className="lp-stat-item">
              <h3>45%</h3>
              <p>faster recap distribution</p>
            </div>
            <div className="lp-stat-item">
              <h3>3x</h3>
              <p>improved meeting follow-through</p>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="lp-pricing">
        <div className="lp-container">
          <div className="lp-features-intro">
            <p className="lp-section-label">Pricing</p>
            <h2 className="lp-section-title">Plans for teams at every stage</h2>
          </div>

          <div className="lp-pricing-grid">
            <article className="lp-price-card">
              <h3>Starter</h3>
              <p className="lp-price">$0<span>/user</span></p>
              <ul>
                <li>Unlimited team calls</li>
                <li>Basic transcripts</li>
                <li>Community support</li>
              </ul>
              <a href="#start" className="lp-btn-plan lp-btn-plan-outline">Start free</a>
            </article>
            <article className="lp-price-card lp-price-card-featured">
              <h3>Business</h3>
              <p className="lp-price">$19<span>/user</span></p>
              <ul>
                <li>AI summaries and action items</li>
                <li>Team analytics</li>
                <li>Priority support</li>
              </ul>
              <a href="#start" className="lp-btn-plan lp-btn-plan-fill">Choose Business</a>
            </article>
            <article className="lp-price-card">
              <h3>Enterprise</h3>
              <p className="lp-price">Custom</p>
              <ul>
                <li>Advanced security controls</li>
                <li>Custom branding</li>
                <li>Dedicated success manager</li>
              </ul>
              <Link href="/pricing" className="lp-btn-plan lp-btn-plan-outline">Contact sales</Link>
            </article>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-container">
          <div className="lp-features-intro">
            <p className="lp-section-label">Testimonials</p>
            <h2 className="lp-section-title">Teams feel the difference in every call</h2>
          </div>

          <div className="lp-testimonial-grid">
            <article className="lp-testimonial-card">
              <p>&quot;This gave us a premium meeting layer with practical AI follow-up, not noise.&quot;</p>
              <h4>Amara Bose</h4>
              <span>Head of Operations, Northstar</span>
            </article>
            <article className="lp-testimonial-card">
              <p>&quot;Our clients notice the quality instantly. Calls are smoother, and notes are always ready.&quot;</p>
              <h4>Daniel Rhee</h4>
              <span>VP Revenue, Brightline</span>
            </article>
            <article className="lp-testimonial-card">
              <p>&quot;The workspace controls made rollout simple across teams with different security requirements.&quot;</p>
              <h4>Mina Carter</h4>
              <span>IT Director, AcmeCloud</span>
            </article>
          </div>
        </div>
      </section>

      <section id="faq" className="lp-strip">
        <div className="lp-container">
          <div className="lp-features-intro">
            <p className="lp-section-label">FAQ</p>
            <h2 className="lp-section-title">Common questions</h2>
          </div>

          <div className="lp-faq-list">
            <details>
              <summary>Can we use this with existing team roles?</summary>
              <p>Yes. Workspace-level role controls let hosts and members keep structured permissions.</p>
            </details>
            <details>
              <summary>Do transcripts and summaries work for every meeting?</summary>
              <p>Yes. Live transcripts and AI recaps are available in supported plans.</p>
            </details>
            <details>
              <summary>Can we apply our own branding?</summary>
              <p>Yes. Business and Enterprise plans can use workspace branding for a consistent identity.</p>
            </details>
          </div>
        </div>
      </section>

      <section id="start" className="lp-join-section">
        <div className="lp-container">
          <div className="lp-join-header">
            <p className="lp-section-label">Get Started</p>
            <h2 className="lp-section-title">Start your next meeting in seconds</h2>
            <p className="lp-section-sub">Jump into secure collaboration with one meeting link and premium call quality.</p>
          </div>

          <div className="lp-start-grid">
            <div className="lp-start-info-card">
              <h3>What happens next</h3>
              <ul>
                <li>Join with a meeting ID or create a fresh room instantly.</li>
                <li>Enable HD media, live transcript, and AI summary flow.</li>
                <li>Share your room with team members in one click.</li>
              </ul>

              {auth ? (
                <section className="lp-auth-panel">
                  <p>
                    Logged in as <strong>{auth.username}</strong> ({auth.role}) in workspace <strong>{auth.workspaceId}</strong>
                  </p>
                  <div className="lp-auth-actions">
                    <Link href="/pricing" className="lp-mini-btn">Pricing</Link>
                    <Link href={`/workspaces/${auth.workspaceId}/settings`} className="lp-mini-btn">Workspace settings</Link>
                    <form action="/api/auth/logout" method="post">
                      <button type="submit" className="lp-mini-btn lp-mini-btn-muted">Logout</button>
                    </form>
                  </div>
                </section>
              ) : (
                <section className="lp-warning-panel">
                  <span>Sign in to unlock host controls, workspace access, and branded rooms.</span>
                  <Link href="/login">Open login</Link>
                </section>
              )}
            </div>

            <div className="lp-join-form-wrap">
              <JoinMeetingForm canCreateHostMeetings={Boolean(auth?.userId)} />
            </div>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-container lp-footer-grid">
          <div>
            <Image
              src="/logo.png"
              alt="Brand logo"
              width={88}
              height={88}
              className="lp-footer-logo"
            />
          </div>
          <div>
            <h5>Product</h5>
            <a href="#features">Features</a>
            <a href="#solutions">Solutions</a>
            <a href="#pricing">Pricing</a>
          </div>
          <div>
            <h5>Company</h5>
            <Link href="/pricing">Plans</Link>
            <Link href="/meeting-history">Meeting history</Link>
            <Link href="/workspaces">Workspaces</Link>
          </div>
          <div>
            <h5>Support</h5>
            <Link href="/login">Login</Link>
            <a href="#faq">FAQ</a>
            <a href="#start">Get started</a>
          </div>
        </div>
        <div className="lp-footer-bottom">© {year}. All rights reserved.</div>
      </footer>
    </main>
  );
}
