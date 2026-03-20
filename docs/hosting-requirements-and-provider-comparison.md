# MeetFlow Hosting Requirements and Provider Comparison

Date: 2026-03-20
Project: MeetFlow (video-meeting-app)
Prepared for: Hosting architecture review

## 1) One-Page Hosting Requirements (Send to Providers)

We are evaluating hosting for a real-time video conferencing SaaS with AI, secure messaging, and secure file transfer.

### Application Overview
- Web app: Next.js App Router (Node runtime)
- Realtime signaling service: Node.js + Socket.IO
- Media layer: mediasoup SFU (WebRTC)
- Database: PostgreSQL
- Storage: recordings and secure shared files
- AI integrations: OpenAI, Anthropic, Deepgram

### Critical Runtime Requirements
- Support for at least 2 production services:
- Next.js app service
- Signaling/SFU service
- Reliable WebSocket support for long-lived connections
- UDP/TCP networking support for mediasoup RTP/RTCP traffic
- Configurable port ranges for media transport
- Public IP and announced IP handling for WebRTC media
- TLS termination and HTTPS/WSS everywhere

### Data and Storage Requirements
- Managed PostgreSQL (preferred) with daily backups + PITR
- Persistent storage for:
- Meeting recordings
- Secure uploaded files
- Optional object storage integration (S3-compatible) is preferred

### Security and Compliance Requirements
- Secret manager (no plaintext envs in deployment pipeline)
- Key rotation support for JWT and encryption keys
- Network controls (IP allowlist, firewall/security groups)
- DDoS and edge protection
- Audit logs and centralized log retention

### Scalability and Reliability Requirements
- Horizontal scale for web and signaling services
- Autoscaling based on CPU/memory/network/WebSocket load
- Health checks and rolling deployments (zero/low downtime)
- Multi-zone deployment support preferred
- Observability:
- App logs, system metrics, network metrics
- Alerting (latency, packet loss, errors, disconnect spikes)

### Required Environment Variables / Integrations
- JWT_SECRET
- DATABASE_URL
- NEXT_PUBLIC_APP_URL
- NEXT_PUBLIC_SIGNALING_URL
- CLIENT_ORIGIN
- SIGNALING_PORT
- MEDIASOUP_LISTEN_IP
- MEDIASOUP_ANNOUNCED_IP
- MEDIASOUP_MIN_PORT
- MEDIASOUP_MAX_PORT
- NEXT_PUBLIC_STUN_URL
- NEXT_PUBLIC_TURN_URL
- NEXT_PUBLIC_TURN_USERNAME
- NEXT_PUBLIC_TURN_CREDENTIAL
- FFMPEG_PATH
- RECORDINGS_DIR
- DEEPGRAM_API_KEY
- OPENAI_API_KEY
- ANTHROPIC_API_KEY
- SECURE_MESSAGING_KEY
- FILE_SCAN_WEBHOOK_URL (optional)
- FILE_SCAN_FAIL_CLOSED
- FILE_SCAN_INCLUDE_CONTENT

### Questions We Need Providers to Answer
1. Can your platform reliably host mediasoup-based WebRTC SFU workloads with required UDP/TCP networking?
2. How do you support scaling long-lived WebSocket traffic?
3. What is your recommended architecture for app + signaling + Postgres + storage?
4. What are your backup and disaster recovery guarantees?
5. Can you provide reference architectures for 100, 500, and 2000 concurrent users?
6. What are expected monthly costs at each of those scale points?

## 2) Provider Comparison by Budget Tier

### Quick Recommendation
- Best low-cost managed path (fastest launch): Render or Railway (hybrid, with caveats)
- Best balance of control + cost at growth stage: DigitalOcean
- Best long-term scale and enterprise posture: AWS (or Azure if org already standardized there)

### Comparison Table
| Provider | Strengths | Risks / Caveats | Best For |
|---|---|---|---|
| AWS | Strongest networking/control for WebRTC, mature managed services, global scale | Highest complexity, can get expensive without FinOps discipline | Scale and enterprise-ready architecture |
| Azure | Enterprise integrations, strong compliance posture, good global infra | Similar complexity/cost profile to AWS | Enterprise orgs already on Microsoft stack |
| GCP | Solid networking and k8s tooling, good dev ergonomics | Fewer teams have deep ops familiarity vs AWS | Cloud-native teams and k8s-heavy orgs |
| DigitalOcean | Good price/perf simplicity, easier ops than hyperscalers | Less advanced ecosystem at very large scale | Growth-stage startup with moderate ops needs |
| Render | Fast setup, great DX for web APIs and workers | SFU/WebRTC UDP/networking constraints may require workarounds/hybrid | MVP and low DevOps overhead |
| Railway | Very fast deploy, developer-friendly | Similar networking constraints for advanced SFU cases | Prototyping and early beta |

### Practical Hosting Pattern for This App
- Option A (recommended now):
- Next.js app + signaling on DigitalOcean droplets/k8s
- Managed Postgres
- Object storage for recordings/files
- TURN server managed separately
- Option B (startup managed):
- Next.js on Render
- Signaling/SFU on DO/AWS VM where UDP control is guaranteed
- Managed Postgres + object storage

## 3) Suggested Final Stack by Budget Tier

### Starter (Lowest cost, up to ~100 concurrent users)
- Next.js app: 1 small instance
- Signaling/SFU: 1 medium compute instance
- Postgres: managed basic tier
- Storage: object storage + CDN
- TURN: small dedicated instance

### Growth (~500 concurrent users)
- Next.js app: 2-3 instances behind load balancer
- Signaling/SFU: 2-4 instances (room-aware sharding)
- Postgres: managed HA tier with read replica
- Storage: object storage lifecycle policies
- TURN: autoscaled or regionally redundant

### Scale (~2000 concurrent users)
- Next.js app autoscaled across multiple zones
- SFU cluster with placement strategy and telemetry-driven scaling
- Managed Postgres HA + replicas + PITR
- Queue/event backbone for async jobs (recording post-processing, analytics)
- Multi-region readiness plan and failover runbooks

## 4) Monthly Cost Estimate (Rough Order of Magnitude)

These are planning estimates only; exact pricing depends on region, bandwidth, and meeting mix (camera-on %, average duration, recording ratio).

### 100 concurrent users (starter)
- Compute (web + signaling + TURN): $120-$350
- Database: $40-$120
- Storage + egress: $50-$250
- Observability/misc: $20-$100
- Total: $230-$820 / month

### 500 concurrent users (growth)
- Compute: $700-$2,200
- Database: $200-$700
- Storage + egress: $400-$2,000
- Observability/misc: $100-$500
- Total: $1,400-$5,400 / month

### 2000 concurrent users (scale)
- Compute: $4,000-$12,000
- Database: $900-$3,000
- Storage + egress: $2,000-$10,000
- Observability/misc: $400-$1,500
- Total: $7,300-$26,500 / month

## 5) Cost Drivers You Should Expect
- Outbound bandwidth (largest cost in video apps)
- TURN relay usage when direct P2P/UDP paths fail
- Recording ratio and media retention duration
- Geographic distribution and cross-region traffic
- AI usage per minute (translation, summaries, speech)

## 6) Recommendation for Your Current Stage
1. Start with a hybrid architecture that guarantees SFU networking control.
2. Keep Next.js managed where possible, but run SFU on infrastructure with explicit UDP/TCP controls.
3. Move recordings/shared files to object storage early to avoid local disk bottlenecks.
4. Add cost guardrails now: retention policies, bitrate profiles, and AI usage limits.

## 7) What to Send to Hosting Consultants (Copy/Paste)

We run a real-time conferencing platform with Next.js + Node signaling + mediasoup SFU + PostgreSQL.
We need a hosting architecture that supports long-lived WebSockets, UDP/TCP networking for WebRTC media ports, managed Postgres with PITR, secure secret management, and persistent/object storage for recordings/files.
Please provide:
- a reference architecture,
- expected monthly cost at 100/500/2000 concurrent users,
- scaling strategy for signaling and SFU,
- reliability/SLA details,
- and security/compliance options.
